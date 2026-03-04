CXX      := clang++
CXXFLAGS := -std=c++17 -Wall -Wextra -O0 -Iinclude -Ilib -fobjc-arc

# Metal + Cocoa frameworks (macOS only)
LDFLAGS  := -framework Metal \
            -framework Foundation \
            -framework QuartzCore \
            -framework Cocoa

# CppUnit flags
CPPUNIT_CFLAGS := $(shell pkg-config --cflags cppunit 2>/dev/null)
CPPUNIT_LIBS   := $(shell pkg-config --libs   cppunit 2>/dev/null || echo "-lcppunit")

BUILD_DIR := build

# Recursive discovery: picks up .cpp and .mm in all subdirectories
SRC_FILES  := $(shell find src   \( -name '*.cpp' -o -name '*.mm' \) 2>/dev/null)
LIB_FILES  := $(shell find lib   \( -name '*.cpp' -o -name '*.mm' \) 2>/dev/null)

# Tests link game-logic libs only — renderer (.mm) excluded to avoid Metal dependency
GAME_LIBS  := $(shell find lib   -name '*.cpp' ! -path '*/renderer/*' 2>/dev/null)
TEST_FILES := $(shell find tests -name '*.cpp' 2>/dev/null)

APP_BIN  := $(BUILD_DIR)/app
TEST_BIN := $(BUILD_DIR)/test_runner

.PHONY: all test doc clean

all: $(APP_BIN)

$(APP_BIN): $(SRC_FILES) $(LIB_FILES) | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) $^ -o $@ $(LDFLAGS)

test: $(TEST_BIN)
	./$(TEST_BIN)

$(TEST_BIN): $(TEST_FILES) $(GAME_LIBS) | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) $(CPPUNIT_CFLAGS) $^ -o $@ $(CPPUNIT_LIBS)

doc:
	doxygen doc/Doxyfile

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

clean:
	rm -rf $(BUILD_DIR)
