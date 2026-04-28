CXX      = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2
LDFLAGS  = -lcurl

TARGET = mygit

SRCS = main.cpp \
       commands/init.cpp \
       ai/bot.cpp \
       utils/hash.cpp \
       utils/file.cpp

OBJS = $(SRCS:.cpp=.o)

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) -o $@ $^ $(LDFLAGS)

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c -o $@ $<

clean:
	rm -f $(OBJS) $(TARGET)

.PHONY: all clean
