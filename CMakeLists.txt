cmake_minimum_required(VERSION 3.14)

project(KolosalWorkspace LANGUAGES C CXX)

set(BIN_DIR "${CMAKE_BINARY_DIR}/bin")
file(MAKE_DIRECTORY "${BIN_DIR}")

add_subdirectory(kolosal-server)

if(TARGET kolosal_server_exe)
  set_target_properties(kolosal_server_exe PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${BIN_DIR}")
  foreach(cfg IN ITEMS Debug Release RelWithDebInfo MinSizeRel)
    string(TOUPPER "${cfg}" CFG_UP)
    set_target_properties(kolosal_server_exe PROPERTIES "RUNTIME_OUTPUT_DIRECTORY_${CFG_UP}" "${BIN_DIR}")
  endforeach()
endif()

find_program(GO_EXECUTABLE go REQUIRED)

file(GLOB_RECURSE GO_SOURCES CONFIGURE_DEPENDS
  "${CMAKE_SOURCE_DIR}/*.go"
  "${CMAKE_SOURCE_DIR}/internal/**/*.go"
)

set(GO_CLI_NAME "kolosal-cli")
if(WIN32)
  set(GO_CLI_OUT "${BIN_DIR}/${GO_CLI_NAME}.exe")
else()
  set(GO_CLI_OUT "${BIN_DIR}/${GO_CLI_NAME}")
endif()

add_custom_command(
  OUTPUT "${GO_CLI_OUT}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${BIN_DIR}"
  COMMAND ${GO_EXECUTABLE} build -trimpath -ldflags "-s -w" -o "${GO_CLI_OUT}" ./
  WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
  DEPENDS ${GO_SOURCES}
  VERBATIM
  COMMENT "Building Go CLI -> ${GO_CLI_OUT}"
)

add_custom_target(kolosal_cli ALL DEPENDS "${GO_CLI_OUT}")

add_custom_target(all_binaries ALL
  DEPENDS kolosal_cli
)
if(TARGET kolosal_server_exe)
  add_dependencies(all_binaries kolosal_server_exe)
endif()

message(STATUS "Binaries will be placed in: ${BIN_DIR}")
