# Annotate only the private FetchContent build copy. Standard #line keeps
# assertion diagnostics useful without embedding the developer's home path.
file(GLOB_RECURSE sources "${ROOT}/*.c" "${ROOT}/*.cpp" "${ROOT}/*.h" "${ROOT}/*.hpp")
foreach(source IN LISTS sources)
  file(READ "${source}" contents)
  if(NOT contents MATCHES "^#line 1 \"whisper/")
    file(RELATIVE_PATH label "${ROOT}" "${source}")
    file(WRITE "${source}" "#line 1 \"whisper/${label}\"\n${contents}")
  endif()
endforeach()
