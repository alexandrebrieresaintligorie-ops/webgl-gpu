#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>   // CACurrentMediaTime

#include <algorithm>
#include <cmath>
#include "renderer/RendererFactory.h"
#include "renderer/IRenderer.h"
#include "renderer/ICommandBuffer.h"
#include "world/world.hpp"
#include "world/worldRenderer.hpp"
#include "math/mat4.hpp"
#include "camera/camera.hpp"
#include "constants/controls.hpp"
#include "physics/collider.hpp"
#include "constants/physics.hpp"
// ---------------------------------------------------------------------------
@interface AppDelegate : NSObject<NSApplicationDelegate> {
    NSWindow*                  _window;
    std::unique_ptr<IRenderer> _renderer;
    std::unique_ptr<IBuffer>   _uniformBuf;
    WorldRenderer              _worldRenderer;
    Camera                     _camera;
    CFTimeInterval             _lastTime;
    id                         _keyMonitorDown;
    id                         _keyMonitorUp;
    id                         _mouseMonitor;
    uint32_t                   _width;
    uint32_t                   _height;
    BOOL                       _cursorLocked;
    float                      _velY;
    BOOL                       _grounded;
}
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification*)notification
{
    // --- Fullscreen window (borderless, covers menu bar + dock) ---
    NSRect screen = [[NSScreen mainScreen] frame];
    _width  = static_cast<uint32_t>(screen.size.width);
    _height = static_cast<uint32_t>(screen.size.height);

    _window = [[NSWindow alloc]
        initWithContentRect:screen
        styleMask:NSWindowStyleMaskBorderless
        backing:NSBackingStoreBuffered
        defer:NO];
    [_window setLevel:NSMainMenuWindowLevel + 1];
    [_window makeKeyAndOrderFront:nil];
    [NSApp setPresentationOptions:
        NSApplicationPresentationHideMenuBar |
        NSApplicationPresentationHideDock];

    // --- Renderer ---
    NSView* view = [_window contentView];
    _renderer = RendererFactory::create();
    if (!_renderer->init((__bridge void*)view, _width, _height)) {
        NSLog(@"[main] Renderer init failed");
        [NSApp terminate:nil];
        return;
    }

    // --- Camera (world-unit position above the centre-top chunk) ---
    const float camX = (World::CAM_START_CX + 0.5f) * Chunk::SIZE;
    const float camY = static_cast<float>(World::CAM_START_CY + 1) * Chunk::SIZE;
    const float camZ = (World::CAM_START_CZ + 0.5f) * Chunk::SIZE;
    _camera.setPosition(camX, camY, camZ);

    // --- MVP uniform buffer (initial frame) ---
    Mat4 proj = Mat4::perspective(
        0.8727f,
        static_cast<float>(_width) / _height,
        1.0f, 4000.0f);
    Mat4 mvp = Mat4::multiply(proj, _camera.viewMatrix());
    _uniformBuf = _renderer->createBuffer(BufferType::Uniform, sizeof(Mat4));
    _uniformBuf->upload(&mvp, sizeof(Mat4));

    // --- World + meshes ---
    World::instance().init();
    _worldRenderer.init(*_renderer);
    _worldRenderer.buildMeshes(*_renderer, World::instance());

    // --- Event monitors (keyboard + mouse click to lock cursor) ---
    __weak AppDelegate* weakSelf = self;
    _keyMonitorDown = [NSEvent
        addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
        handler:^NSEvent*(NSEvent* e) {
            [weakSelf handleKeyCode:(uint16_t)e.keyCode down:YES];
            return e;
        }];
    _keyMonitorUp = [NSEvent
        addLocalMonitorForEventsMatchingMask:NSEventMaskKeyUp
        handler:^NSEvent*(NSEvent* e) {
            [weakSelf handleKeyCode:(uint16_t)e.keyCode down:NO];
            return e;
        }];
    _mouseMonitor = [NSEvent
        addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown
        handler:^NSEvent*(NSEvent* e) {
            [weakSelf lockCursor];
            return e;
        }];

    // --- Render loop ---
    _lastTime = CACurrentMediaTime();
    [NSTimer scheduledTimerWithTimeInterval:(1.0 / 60.0)
                                     target:self
                                   selector:@selector(tick:)
                                   userInfo:nil
                                    repeats:YES];
}

- (void)lockCursor
{
    if (_cursorLocked) return;
    _cursorLocked = YES;
    [NSCursor hide];
}

- (void)unlockCursor
{
    if (!_cursorLocked) return;
    _cursorLocked = NO;
    [NSCursor unhide];
}

- (void)handleKeyCode:(uint16_t)code down:(BOOL)down
{
    if (down && code == Controls::kQuit) {
        [self unlockCursor];
        [NSApp terminate:nil];
        return;
    }
    if (down && code == Controls::kJump) {
        if (_grounded) {
            _velY    = PhysicsConstants::kJumpForce;
            _grounded = NO;
        }
        return;  // Space is not forwarded to the camera
    }
    if (down) _camera.keyDown(code);
    else      _camera.keyUp(code);
}

- (void)tick:(NSTimer*)timer
{
    // --- Delta time ---
    CFTimeInterval now = CACurrentMediaTime();
    float dt = static_cast<float>(now - _lastTime);
    _lastTime = now;
    if (dt > 0.1f) dt = 0.1f;  // cap: avoid spiral-of-death after a stall

    // --- Gravity ---
    _velY -= PhysicsConstants::kGravity * dt;
    if (_velY < -PhysicsConstants::kTerminalVelocity)
        _velY = -PhysicsConstants::kTerminalVelocity;

    // --- Update camera (horizontal movement only) ---
    _camera.update(dt);
    World::instance().update(_camera.x(), _camera.y(), _camera.z());

    // --- Convert stored eye position → physics body centre ---
    // The camera stores the eye (rendering) Y = bodyCenter + kEyeOffset.
    // All collision functions operate on the body centre so that the symmetric
    // hitbox (± kHitboxHeight/2) sits correctly around the physics body.
    float camX = _camera.x();
    float camY = _camera.y() - PhysicsConstants::kEyeOffset;
    float camZ = _camera.z();

    // --- Resolve horizontal movement against walls ---
    Collider::resolveXZ(camX, camY, camZ, World::instance());

    // --- Integrate vertical velocity into Y (sub-stepped to prevent tunnelling) ---
    // Splitting into steps of at most kMaxSubStepY (< 1 voxel) guarantees that
    // resolveY always sees an overlap and can push the camera back to the surface.
    const float totalDeltaY = _velY * dt;
    const int nSteps = std::max(1, static_cast<int>(
        std::ceil(std::abs(totalDeltaY) / PhysicsConstants::kMaxSubStepY)));
    const float stepY = totalDeltaY / static_cast<float>(nSteps);

    for (int i = 0; i < nSteps; ++i) {
        camY += stepY;
        Collider::resolveY(camX, camY, camZ, World::instance());
    }

    // --- Grounded check: stop falling when on solid ground ---
    _grounded = Collider::isGrounded(camX, camY, camZ, World::instance());
    if (_grounded && _velY < 0.0f)
        _velY = 0.0f;

    // --- Store eye position back into camera ---
    _camera.setPosition(camX, camY + PhysicsConstants::kEyeOffset, camZ);

    // --- Rebuild MVP ---
    Mat4 proj = Mat4::perspective(
        0.8727f,
        static_cast<float>(_width) / _height,
        1.0f, 4000.0f);
    Mat4 mvp = Mat4::multiply(proj, _camera.viewMatrix());
    _uniformBuf->upload(&mvp, sizeof(Mat4));

    // --- Render ---
    ICommandBuffer* cmd = _renderer->beginFrame();
    if (!cmd) return;

    _worldRenderer.render(*cmd, *_uniformBuf);

    _renderer->endFrame();
    _renderer->present();
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication*)sender
{
    return YES;
}

- (void)dealloc
{
    [self unlockCursor];
    if (_keyMonitorDown) [NSEvent removeMonitor:_keyMonitorDown];
    if (_keyMonitorUp)   [NSEvent removeMonitor:_keyMonitorUp];
    if (_mouseMonitor)   [NSEvent removeMonitor:_mouseMonitor];
    World::destroy();
}

@end

// ---------------------------------------------------------------------------
int main()
{
    @autoreleasepool {
        NSApplication* app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        AppDelegate* delegate = [[AppDelegate alloc] init];
        [app setDelegate:delegate];
        [app activateIgnoringOtherApps:YES];
        [app run];
    }
    return 0;
}
