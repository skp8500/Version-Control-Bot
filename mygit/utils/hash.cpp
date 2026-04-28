#include "hash.hpp"
#include <sstream>

std::string djb2Hash(const std::string& content) {
    unsigned long hash = 5381;
    for (unsigned char c : content) {
        hash = ((hash << 5) + hash) + c;
    }
    std::ostringstream ss;
    ss << std::hex << hash;
    return ss.str();
}
