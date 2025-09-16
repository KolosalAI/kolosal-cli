# Wrapper to allow kolosal-server/CMakeLists.txt to include from ${CMAKE_SOURCE_DIR}/cmake/ucm.cmake
# Forward-include the subproject's provided ucm.cmake.
include("${CMAKE_CURRENT_LIST_DIR}/../kolosal-server/cmake/ucm.cmake")
