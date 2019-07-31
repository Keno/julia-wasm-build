var Module = typeof Module !== "undefined" ? Module : {};

Module.preRun.push(function() {
 if (typeof Asyncify !== "undefined") {
  Asyncify.instrumentWasmExports = function(exports) {
   return exports;
  };
  Asyncify.handleSleep = function(startAsync) {
   if (ABORT) return;
   Module["noExitRuntime"] = true;
   if (Asyncify.state === Asyncify.State.Normal) {
    var reachedCallback = false;
    var reachedAfterCallback = false;
    var task = get_current_task();
    startAsync(function(returnValue) {
     assert(!returnValue || typeof returnValue === "number");
     if (ABORT) return;
     Asyncify.returnValue = returnValue || 0;
     reachedCallback = true;
     if (!reachedAfterCallback) {
      return;
     }
     schedule_and_wait(task);
    });
    reachedAfterCallback = true;
    if (!reachedCallback) {
     Module["_jl_task_wait"]();
    }
   } else if (Asyncify.state === Asyncify.State.Rewinding) {
    finish_schedule_task();
   } else {
    abort("invalid state: " + Asyncify.state);
   }
   return Asyncify.returnValue;
  };
 }
});

function get_current_task() {
 return Module["_jl_get_current_task"]();
}

function get_root_task() {
 return Module["_jl_get_root_task"]();
}

function task_ctx_ptr(task) {
 return Module["_task_ctx_ptr"](task);
}

function ctx_save(ctx) {
 var stackPtr = stackSave();
 HEAP32[ctx + 4 >> 2] = stackPtr;
 Asyncify.state = Asyncify.State.Unwinding;
 Module["_asyncify_start_unwind"](ctx);
 if (Browser.mainLoop.func) {
  Browser.mainLoop.pause();
 }
}

function do_start_task(old_stack) {
 try {
  Module["_start_task"]();
 } catch (e) {
  stackRestore(old_stack);
  if (e !== e + 0 && e !== "killed") throw e;
  maybe_schedule_next();
  return;
 }
 if (Asyncify.state === Asyncify.State.Unwinding) {
  Asyncify.state = Asyncify.State.Normal;
  Module["_asyncify_stop_unwind"]();
 }
 stackRestore(old_stack);
 maybe_schedule_next();
}

function schedule_and_wait(task) {
 Module["_jl_schedule_task"](task);
 Module["_jl_task_wait"]();
}

function finish_schedule_task() {
 Asyncify.state = Asyncify.State.Normal;
 Module["_asyncify_stop_rewind"]();
}

next_ctx = 0;

next_need_start = true;

function set_next_ctx(ctx, needs_start) {
 next_ctx = ctx;
 next_need_start = needs_start;
}

function root_ctx() {
 return task_ctx_ptr(get_root_task());
}

function ctx_switch(lastt_ctx) {
 if (lastt_ctx == root_ctx()) {
  return schedule_next();
 } else if (lastt_ctx == 0) {
  throw "killed";
 } else {
  return ctx_save(lastt_ctx);
 }
}

function schedule_next() {
 old_stack = stackSave();
 var next_task_stack = HEAP32[next_ctx + 4 >> 2];
 if (!next_need_start) {
  Asyncify.state = Asyncify.State.Rewinding;
  Module["_asyncify_start_rewind"](next_ctx);
  if (Browser.mainLoop.func) {
   Browser.mainLoop.resume();
  }
 }
 next_ctx = -1;
 stackRestore(next_task_stack);
 do_start_task(old_stack);
}

function maybe_schedule_next() {
 assert(next_ctx != -1);
 if (next_ctx == root_ctx() || next_ctx == 0) {
  return;
 }
 schedule_next();
}

if (typeof window === "object") {
 Module["arguments"] = window.location.search.substr(1).trim().split("&");
 if (!Module["arguments"][0]) {
  Module["arguments"] = [];
 }
}

var moduleOverrides = {};

var key;

for (key in Module) {
 if (Module.hasOwnProperty(key)) {
  moduleOverrides[key] = Module[key];
 }
}

var arguments_ = [];

var thisProgram = "./this.program";

var quit_ = function(status, toThrow) {
 throw toThrow;
};

var ENVIRONMENT_IS_WEB = false;

var ENVIRONMENT_IS_WORKER = false;

var ENVIRONMENT_IS_NODE = false;

var ENVIRONMENT_HAS_NODE = false;

var ENVIRONMENT_IS_SHELL = false;

ENVIRONMENT_IS_WEB = typeof window === "object";

ENVIRONMENT_IS_WORKER = typeof importScripts === "function";

ENVIRONMENT_HAS_NODE = typeof process === "object" && typeof process.versions === "object" && typeof process.versions.node === "string";

ENVIRONMENT_IS_NODE = ENVIRONMENT_HAS_NODE && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;

ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

if (Module["ENVIRONMENT"]) {
 throw new Error("Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -s ENVIRONMENT=web or -s ENVIRONMENT=node)");
}

var scriptDirectory = "";

function locateFile(path) {
 if (Module["locateFile"]) {
  return Module["locateFile"](path, scriptDirectory);
 } else {
  return scriptDirectory + path;
 }
}

var read_, readAsync, readBinary, setWindowTitle;

if (ENVIRONMENT_IS_NODE) {
 scriptDirectory = __dirname + "/";
 var nodeFS;
 var nodePath;
 read_ = function shell_read(filename, binary) {
  var ret;
  if (!nodeFS) nodeFS = require("fs");
  if (!nodePath) nodePath = require("path");
  filename = nodePath["normalize"](filename);
  ret = nodeFS["readFileSync"](filename);
  return binary ? ret : ret.toString();
 };
 readBinary = function readBinary(filename) {
  var ret = read_(filename, true);
  if (!ret.buffer) {
   ret = new Uint8Array(ret);
  }
  assert(ret.buffer);
  return ret;
 };
 if (process["argv"].length > 1) {
  thisProgram = process["argv"][1].replace(/\\/g, "/");
 }
 arguments_ = process["argv"].slice(2);
 if (typeof module !== "undefined") {
  module["exports"] = Module;
 }
 process["on"]("uncaughtException", function(ex) {
  if (!(ex instanceof ExitStatus)) {
   throw ex;
  }
 });
 process["on"]("unhandledRejection", abort);
 quit_ = function(status) {
  process["exit"](status);
 };
 Module["inspect"] = function() {
  return "[Emscripten Module object]";
 };
} else if (ENVIRONMENT_IS_SHELL) {
 if (typeof read != "undefined") {
  read_ = function shell_read(f) {
   return read(f);
  };
 }
 readBinary = function readBinary(f) {
  var data;
  if (typeof readbuffer === "function") {
   return new Uint8Array(readbuffer(f));
  }
  data = read(f, "binary");
  assert(typeof data === "object");
  return data;
 };
 if (typeof scriptArgs != "undefined") {
  arguments_ = scriptArgs;
 } else if (typeof arguments != "undefined") {
  arguments_ = arguments;
 }
 if (typeof quit === "function") {
  quit_ = function(status) {
   quit(status);
  };
 }
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
 if (ENVIRONMENT_IS_WORKER) {
  scriptDirectory = self.location.href;
 } else if (document.currentScript) {
  scriptDirectory = document.currentScript.src;
 }
 if (scriptDirectory.indexOf("blob:") !== 0) {
  scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf("/") + 1);
 } else {
  scriptDirectory = "";
 }
 read_ = function shell_read(url) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, false);
  xhr.send(null);
  return xhr.responseText;
 };
 if (ENVIRONMENT_IS_WORKER) {
  readBinary = function readBinary(url) {
   var xhr = new XMLHttpRequest();
   xhr.open("GET", url, false);
   xhr.responseType = "arraybuffer";
   xhr.send(null);
   return new Uint8Array(xhr.response);
  };
 }
 readAsync = function readAsync(url, onload, onerror) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.responseType = "arraybuffer";
  xhr.onload = function xhr_onload() {
   if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
    onload(xhr.response);
    return;
   }
   onerror();
  };
  xhr.onerror = onerror;
  xhr.send(null);
 };
 setWindowTitle = function(title) {
  document.title = title;
 };
} else {
 throw new Error("environment detection error");
}

var out = Module["print"] || (typeof console !== "undefined" ? console.log.bind(console) : typeof print !== "undefined" ? print : null);

var err = Module["printErr"] || (typeof printErr !== "undefined" ? printErr : typeof console !== "undefined" && console.warn.bind(console) || out);

for (key in moduleOverrides) {
 if (moduleOverrides.hasOwnProperty(key)) {
  Module[key] = moduleOverrides[key];
 }
}

moduleOverrides = null;

if (Module["arguments"]) arguments_ = Module["arguments"];

if (Module["thisProgram"]) thisProgram = Module["thisProgram"];

if (Module["quit"]) quit_ = Module["quit"];

assert(typeof Module["memoryInitializerPrefixURL"] === "undefined", "Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead");

assert(typeof Module["pthreadMainPrefixURL"] === "undefined", "Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead");

assert(typeof Module["cdInitializerPrefixURL"] === "undefined", "Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead");

assert(typeof Module["filePackagePrefixURL"] === "undefined", "Module.filePackagePrefixURL option was removed, use Module.locateFile instead");

assert(typeof Module["read"] === "undefined", "Module.read option was removed (modify read_ in JS)");

assert(typeof Module["readAsync"] === "undefined", "Module.readAsync option was removed (modify readAsync in JS)");

assert(typeof Module["readBinary"] === "undefined", "Module.readBinary option was removed (modify readBinary in JS)");

assert(typeof Module["setWindowTitle"] === "undefined", "Module.setWindowTitle option was removed (modify setWindowTitle in JS)");

Object.defineProperty(Module, "read", {
 get: function() {
  abort("Module.read has been replaced with plain read");
 }
});

Object.defineProperty(Module, "readAsync", {
 get: function() {
  abort("Module.readAsync has been replaced with plain readAsync");
 }
});

Object.defineProperty(Module, "readBinary", {
 get: function() {
  abort("Module.readBinary has been replaced with plain readBinary");
 }
});

stackSave = stackRestore = stackAlloc = function() {
 abort("cannot use the stack before compiled code is ready to run, and has provided stack access");
};

function dynamicAlloc(size) {
 assert(DYNAMICTOP_PTR);
 var ret = HEAP32[DYNAMICTOP_PTR >> 2];
 var end = ret + size + 15 & -16;
 if (end > _emscripten_get_heap_size()) {
  abort("failure to dynamicAlloc - memory growth etc. is not supported there, call malloc/sbrk directly");
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = end;
 return ret;
}

function getNativeTypeSize(type) {
 switch (type) {
 case "i1":
 case "i8":
  return 1;

 case "i16":
  return 2;

 case "i32":
  return 4;

 case "i64":
  return 8;

 case "float":
  return 4;

 case "double":
  return 8;

 default:
  {
   if (type[type.length - 1] === "*") {
    return 4;
   } else if (type[0] === "i") {
    var bits = parseInt(type.substr(1));
    assert(bits % 8 === 0, "getNativeTypeSize invalid bits " + bits + ", type " + type);
    return bits / 8;
   } else {
    return 0;
   }
  }
 }
}

function warnOnce(text) {
 if (!warnOnce.shown) warnOnce.shown = {};
 if (!warnOnce.shown[text]) {
  warnOnce.shown[text] = 1;
  err(text);
 }
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
 if (!func) return;
 assert(sig);
 if (!funcWrappers[sig]) {
  funcWrappers[sig] = {};
 }
 var sigCache = funcWrappers[sig];
 if (!sigCache[func]) {
  if (sig.length === 1) {
   sigCache[func] = function dynCall_wrapper() {
    return dynCall(sig, func);
   };
  } else if (sig.length === 2) {
   sigCache[func] = function dynCall_wrapper(arg) {
    return dynCall(sig, func, [ arg ]);
   };
  } else {
   sigCache[func] = function dynCall_wrapper() {
    return dynCall(sig, func, Array.prototype.slice.call(arguments));
   };
  }
 }
 return sigCache[func];
}

function makeBigInt(low, high, unsigned) {
 return unsigned ? +(low >>> 0) + +(high >>> 0) * 4294967296 : +(low >>> 0) + +(high | 0) * 4294967296;
}

function dynCall(sig, ptr, args) {
 if (args && args.length) {
  assert(args.length == sig.length - 1);
  assert("dynCall_" + sig in Module, "bad function pointer type - no table for sig '" + sig + "'");
  return Module["dynCall_" + sig].apply(null, [ ptr ].concat(args));
 } else {
  assert(sig.length == 1);
  assert("dynCall_" + sig in Module, "bad function pointer type - no table for sig '" + sig + "'");
  return Module["dynCall_" + sig].call(null, ptr);
 }
}

var tempRet0 = 0;

var setTempRet0 = function(value) {
 tempRet0 = value;
};

var getTempRet0 = function() {
 return tempRet0;
};

function getCompilerSetting(name) {
 throw "You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work";
}

if (typeof WebAssembly !== "object") {
 abort("No WebAssembly support found. Build with -s WASM=0 to target JavaScript instead.");
}

function setValue(ptr, value, type, noSafe) {
 type = type || "i8";
 if (type.charAt(type.length - 1) === "*") type = "i32";
 if (noSafe) {
  switch (type) {
  case "i1":
   HEAP8[ptr >> 0] = value;
   break;

  case "i8":
   HEAP8[ptr >> 0] = value;
   break;

  case "i16":
   HEAP16[ptr >> 1] = value;
   break;

  case "i32":
   HEAP32[ptr >> 2] = value;
   break;

  case "i64":
   tempI64 = [ value >>> 0, (tempDouble = value, +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0) ], 
   HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
   break;

  case "float":
   HEAPF32[ptr >> 2] = value;
   break;

  case "double":
   HEAPF64[ptr >> 3] = value;
   break;

  default:
   abort("invalid type for setValue: " + type);
  }
 } else {
  switch (type) {
  case "i1":
   SAFE_HEAP_STORE(ptr | 0, value | 0, 1);
   break;

  case "i8":
   SAFE_HEAP_STORE(ptr | 0, value | 0, 1);
   break;

  case "i16":
   SAFE_HEAP_STORE(ptr | 0, value | 0, 2);
   break;

  case "i32":
   SAFE_HEAP_STORE(ptr | 0, value | 0, 4);
   break;

  case "i64":
   tempI64 = [ value >>> 0, (tempDouble = value, +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0) ], 
   SAFE_HEAP_STORE(ptr | 0, tempI64[0] | 0, 4), SAFE_HEAP_STORE(ptr + 4 | 0, tempI64[1] | 0, 4);
   break;

  case "float":
   SAFE_HEAP_STORE_D(ptr | 0, Math_fround(value), 4);
   break;

  case "double":
   SAFE_HEAP_STORE_D(ptr | 0, +value, 8);
   break;

  default:
   abort("invalid type for setValue: " + type);
  }
 }
}

function getValue(ptr, type, noSafe) {
 type = type || "i8";
 if (type.charAt(type.length - 1) === "*") type = "i32";
 if (noSafe) {
  switch (type) {
  case "i1":
   return HEAP8[ptr >> 0];

  case "i8":
   return HEAP8[ptr >> 0];

  case "i16":
   return HEAP16[ptr >> 1];

  case "i32":
   return HEAP32[ptr >> 2];

  case "i64":
   return HEAP32[ptr >> 2];

  case "float":
   return HEAPF32[ptr >> 2];

  case "double":
   return HEAPF64[ptr >> 3];

  default:
   abort("invalid type for getValue: " + type);
  }
 } else {
  switch (type) {
  case "i1":
   return SAFE_HEAP_LOAD(ptr | 0, 1, 0) | 0;

  case "i8":
   return SAFE_HEAP_LOAD(ptr | 0, 1, 0) | 0;

  case "i16":
   return SAFE_HEAP_LOAD(ptr | 0, 2, 0) | 0;

  case "i32":
   return SAFE_HEAP_LOAD(ptr | 0, 4, 0) | 0;

  case "i64":
   return SAFE_HEAP_LOAD(ptr | 0, 8, 0) | 0;

  case "float":
   return Math_fround(SAFE_HEAP_LOAD_D(ptr | 0, 4, 0));

  case "double":
   return +SAFE_HEAP_LOAD_D(ptr | 0, 8, 0);

  default:
   abort("invalid type for getValue: " + type);
  }
 }
 return null;
}

function getSafeHeapType(bytes, isFloat) {
 switch (bytes) {
 case 1:
  return "i8";

 case 2:
  return "i16";

 case 4:
  return isFloat ? "float" : "i32";

 case 8:
  return "double";

 default:
  assert(0);
 }
}

function SAFE_HEAP_STORE(dest, value, bytes, isFloat) {
 if (dest <= 0) abort("segmentation fault storing " + bytes + " bytes to address " + dest);
 if (dest % bytes !== 0) abort("alignment error storing to address " + dest + ", which was expected to be aligned to a multiple of " + bytes);
 if (dest + bytes > HEAP32[DYNAMICTOP_PTR >> 2]) abort("segmentation fault, exceeded the top of the available dynamic heap when storing " + bytes + " bytes to address " + dest + ". DYNAMICTOP=" + HEAP32[DYNAMICTOP_PTR >> 2]);
 assert(DYNAMICTOP_PTR);
 assert(HEAP32[DYNAMICTOP_PTR >> 2] <= HEAP8.length);
 setValue(dest, value, getSafeHeapType(bytes, isFloat), 1);
}

function SAFE_HEAP_STORE_D(dest, value, bytes) {
 SAFE_HEAP_STORE(dest, value, bytes, true);
}

function SAFE_HEAP_LOAD(dest, bytes, unsigned, isFloat) {
 if (dest <= 0) abort("segmentation fault loading " + bytes + " bytes from address " + dest);
 if (dest % bytes !== 0) abort("alignment error loading from address " + dest + ", which was expected to be aligned to a multiple of " + bytes);
 if (dest + bytes > HEAP32[DYNAMICTOP_PTR >> 2]) abort("segmentation fault, exceeded the top of the available dynamic heap when loading " + bytes + " bytes from address " + dest + ". DYNAMICTOP=" + HEAP32[DYNAMICTOP_PTR >> 2]);
 assert(DYNAMICTOP_PTR);
 assert(HEAP32[DYNAMICTOP_PTR >> 2] <= HEAP8.length);
 var type = getSafeHeapType(bytes, isFloat);
 var ret = getValue(dest, type, 1);
 if (unsigned) ret = unSign(ret, parseInt(type.substr(1)), 1);
 return ret;
}

function SAFE_HEAP_LOAD_D(dest, bytes, unsigned) {
 return SAFE_HEAP_LOAD(dest, bytes, unsigned, true);
}

function segfault() {
 abort("segmentation fault");
}

function alignfault() {
 abort("alignment fault");
}

var wasmMemory;

var wasmTable;

var ABORT = false;

var EXITSTATUS = 0;

function assert(condition, text) {
 if (!condition) {
  abort("Assertion failed: " + text);
 }
}

var ALLOC_NORMAL = 0;

var ALLOC_STACK = 1;

var ALLOC_NONE = 3;

function allocate(slab, types, allocator, ptr) {
 var zeroinit, size;
 if (typeof slab === "number") {
  zeroinit = true;
  size = slab;
 } else {
  zeroinit = false;
  size = slab.length;
 }
 var singleType = typeof types === "string" ? types : null;
 var ret;
 if (allocator == ALLOC_NONE) {
  ret = ptr;
 } else {
  ret = [ _malloc, stackAlloc, dynamicAlloc ][allocator](Math.max(size, singleType ? 1 : types.length));
 }
 if (zeroinit) {
  var stop;
  ptr = ret;
  assert((ret & 3) == 0);
  stop = ret + (size & ~3);
  for (;ptr < stop; ptr += 4) {
   HEAP32[ptr >> 2] = 0;
  }
  stop = ret + size;
  while (ptr < stop) {
   HEAP8[ptr++ >> 0] = 0;
  }
  return ret;
 }
 if (singleType === "i8") {
  if (slab.subarray || slab.slice) {
   HEAPU8.set(slab, ret);
  } else {
   HEAPU8.set(new Uint8Array(slab), ret);
  }
  return ret;
 }
 var i = 0, type, typeSize, previousType;
 while (i < size) {
  var curr = slab[i];
  type = singleType || types[i];
  if (type === 0) {
   i++;
   continue;
  }
  assert(type, "Must know what type to store in allocate!");
  if (type == "i64") type = "i32";
  setValue(ret + i, curr, type);
  if (previousType !== type) {
   typeSize = getNativeTypeSize(type);
   previousType = type;
  }
  i += typeSize;
 }
 return ret;
}

function getMemory(size) {
 if (!runtimeInitialized) return dynamicAlloc(size);
 return _malloc(size);
}

var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined;

function UTF8ArrayToString(u8Array, idx, maxBytesToRead) {
 var endIdx = idx + maxBytesToRead;
 var endPtr = idx;
 while (u8Array[endPtr] && !(endPtr >= endIdx)) ++endPtr;
 if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
  return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
 } else {
  var str = "";
  while (idx < endPtr) {
   var u0 = u8Array[idx++];
   if (!(u0 & 128)) {
    str += String.fromCharCode(u0);
    continue;
   }
   var u1 = u8Array[idx++] & 63;
   if ((u0 & 224) == 192) {
    str += String.fromCharCode((u0 & 31) << 6 | u1);
    continue;
   }
   var u2 = u8Array[idx++] & 63;
   if ((u0 & 240) == 224) {
    u0 = (u0 & 15) << 12 | u1 << 6 | u2;
   } else {
    if ((u0 & 248) != 240) warnOnce("Invalid UTF-8 leading byte 0x" + u0.toString(16) + " encountered when deserializing a UTF-8 string on the asm.js/wasm heap to a JS string!");
    u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | u8Array[idx++] & 63;
   }
   if (u0 < 65536) {
    str += String.fromCharCode(u0);
   } else {
    var ch = u0 - 65536;
    str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
   }
  }
 }
 return str;
}

function UTF8ToString(ptr, maxBytesToRead) {
 return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
}

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
 if (!(maxBytesToWrite > 0)) return 0;
 var startIdx = outIdx;
 var endIdx = outIdx + maxBytesToWrite - 1;
 for (var i = 0; i < str.length; ++i) {
  var u = str.charCodeAt(i);
  if (u >= 55296 && u <= 57343) {
   var u1 = str.charCodeAt(++i);
   u = 65536 + ((u & 1023) << 10) | u1 & 1023;
  }
  if (u <= 127) {
   if (outIdx >= endIdx) break;
   outU8Array[outIdx++] = u;
  } else if (u <= 2047) {
   if (outIdx + 1 >= endIdx) break;
   outU8Array[outIdx++] = 192 | u >> 6;
   outU8Array[outIdx++] = 128 | u & 63;
  } else if (u <= 65535) {
   if (outIdx + 2 >= endIdx) break;
   outU8Array[outIdx++] = 224 | u >> 12;
   outU8Array[outIdx++] = 128 | u >> 6 & 63;
   outU8Array[outIdx++] = 128 | u & 63;
  } else {
   if (outIdx + 3 >= endIdx) break;
   if (u >= 2097152) warnOnce("Invalid Unicode code point 0x" + u.toString(16) + " encountered when serializing a JS string to an UTF-8 string on the asm.js/wasm heap! (Valid unicode code points should be in range 0-0x1FFFFF).");
   outU8Array[outIdx++] = 240 | u >> 18;
   outU8Array[outIdx++] = 128 | u >> 12 & 63;
   outU8Array[outIdx++] = 128 | u >> 6 & 63;
   outU8Array[outIdx++] = 128 | u & 63;
  }
 }
 outU8Array[outIdx] = 0;
 return outIdx - startIdx;
}

function stringToUTF8(str, outPtr, maxBytesToWrite) {
 assert(typeof maxBytesToWrite == "number", "stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!");
 return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
}

function lengthBytesUTF8(str) {
 var len = 0;
 for (var i = 0; i < str.length; ++i) {
  var u = str.charCodeAt(i);
  if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
  if (u <= 127) ++len; else if (u <= 2047) len += 2; else if (u <= 65535) len += 3; else len += 4;
 }
 return len;
}

var UTF16Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-16le") : undefined;

function allocateUTF8(str) {
 var size = lengthBytesUTF8(str) + 1;
 var ret = _malloc(size);
 if (ret) stringToUTF8Array(str, HEAP8, ret, size);
 return ret;
}

function allocateUTF8OnStack(str) {
 var size = lengthBytesUTF8(str) + 1;
 var ret = stackAlloc(size);
 stringToUTF8Array(str, HEAP8, ret, size);
 return ret;
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
 for (var i = 0; i < str.length; ++i) {
  assert(str.charCodeAt(i) === str.charCodeAt(i) & 255);
  SAFE_HEAP_STORE(buffer++ | 0, str.charCodeAt(i) | 0, 1);
 }
 if (!dontAddNull) SAFE_HEAP_STORE(buffer | 0, 0 | 0, 1);
}

function demangle(func) {
 return func;
}

function demangleAll(text) {
 var regex = /_Z[\w\d_]+/g;
 return text.replace(regex, function(x) {
  var y = demangle(x);
  return x === y ? x : y + " [" + x + "]";
 });
}

function jsStackTrace() {
 var err = new Error();
 if (!err.stack) {
  try {
   throw new Error(0);
  } catch (e) {
   err = e;
  }
  if (!err.stack) {
   return "(no stack trace available)";
  }
 }
 return err.stack.toString();
}

function stackTrace() {
 var js = jsStackTrace();
 if (Module["extraStackTrace"]) js += "\n" + Module["extraStackTrace"]();
 return demangleAll(js);
}

var PAGE_SIZE = 16384;

var WASM_PAGE_SIZE = 65536;

function alignUp(x, multiple) {
 if (x % multiple > 0) {
  x += multiple - x % multiple;
 }
 return x;
}

var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBufferViews() {
 Module["HEAP8"] = HEAP8 = new Int8Array(buffer);
 Module["HEAP16"] = HEAP16 = new Int16Array(buffer);
 Module["HEAP32"] = HEAP32 = new Int32Array(buffer);
 Module["HEAPU8"] = HEAPU8 = new Uint8Array(buffer);
 Module["HEAPU16"] = HEAPU16 = new Uint16Array(buffer);
 Module["HEAPU32"] = HEAPU32 = new Uint32Array(buffer);
 Module["HEAPF32"] = HEAPF32 = new Float32Array(buffer);
 Module["HEAPF64"] = HEAPF64 = new Float64Array(buffer);
}

var STACK_BASE = 49410864, STACK_MAX = 44167984, DYNAMIC_BASE = 49410864, DYNAMICTOP_PTR = 44167968;

assert(STACK_BASE % 16 === 0, "stack must start aligned");

assert(DYNAMIC_BASE % 16 === 0, "heap must start aligned");

var TOTAL_STACK = 5242880;

if (Module["TOTAL_STACK"]) assert(TOTAL_STACK === Module["TOTAL_STACK"], "the stack size can no longer be determined at runtime");

var INITIAL_TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 536870912;

assert(INITIAL_TOTAL_MEMORY >= TOTAL_STACK, "TOTAL_MEMORY should be larger than TOTAL_STACK, was " + INITIAL_TOTAL_MEMORY + "! (TOTAL_STACK=" + TOTAL_STACK + ")");

assert(typeof Int32Array !== "undefined" && typeof Float64Array !== "undefined" && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined, "JS engine does not provide full typed array support");

if (Module["wasmMemory"]) {
 wasmMemory = Module["wasmMemory"];
} else {
 wasmMemory = new WebAssembly.Memory({
  "initial": INITIAL_TOTAL_MEMORY / WASM_PAGE_SIZE
 });
}

if (wasmMemory) {
 buffer = wasmMemory.buffer;
}

INITIAL_TOTAL_MEMORY = buffer.byteLength;

assert(INITIAL_TOTAL_MEMORY % WASM_PAGE_SIZE === 0);

updateGlobalBufferViews();

HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;

function writeStackCookie() {
 assert((STACK_MAX & 3) == 0);
 HEAPU32[(STACK_MAX >> 2) + 1] = 34821223;
 HEAPU32[(STACK_MAX >> 2) + 2] = 2310721022;
}

function checkStackCookie() {
 var cookie1 = HEAPU32[(STACK_MAX >> 2) + 1];
 var cookie2 = HEAPU32[(STACK_MAX >> 2) + 2];
 if (cookie1 != 34821223 || cookie2 != 2310721022) {
  abort("Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x" + cookie2.toString(16) + " " + cookie1.toString(16));
 }
 if (HEAP32[0] !== 1668509029) abort("Runtime error: The application has corrupted its heap memory area (address zero)!");
}

HEAP32[0] = 1668509029;

HEAP16[1] = 25459;

if (HEAPU8[2] !== 115 || HEAPU8[3] !== 99) throw "Runtime error: expected the system to be little-endian!";

function callRuntimeCallbacks(callbacks) {
 while (callbacks.length > 0) {
  var callback = callbacks.shift();
  if (typeof callback == "function") {
   callback();
   continue;
  }
  var func = callback.func;
  if (typeof func === "number") {
   if (callback.arg === undefined) {
    Module["dynCall_v"](func);
   } else {
    Module["dynCall_vi"](func, callback.arg);
   }
  } else {
   func(callback.arg === undefined ? null : callback.arg);
  }
 }
}

var __ATPRERUN__ = [];

var __ATINIT__ = [];

var __ATMAIN__ = [];

var __ATEXIT__ = [];

var __ATPOSTRUN__ = [];

var runtimeInitialized = false;

var runtimeExited = false;

function preRun() {
 if (Module["preRun"]) {
  if (typeof Module["preRun"] == "function") Module["preRun"] = [ Module["preRun"] ];
  while (Module["preRun"].length) {
   addOnPreRun(Module["preRun"].shift());
  }
 }
 callRuntimeCallbacks(__ATPRERUN__);
}

function initRuntime() {
 checkStackCookie();
 assert(!runtimeInitialized);
 runtimeInitialized = true;
 if (!Module["noFSInit"] && !FS.init.initialized) FS.init();
 TTY.init();
 callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
 checkStackCookie();
 FS.ignorePermissions = false;
 callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
 checkStackCookie();
 callRuntimeCallbacks(__ATEXIT__);
 FS.quit();
 TTY.shutdown();
 runtimeExited = true;
}

function postRun() {
 checkStackCookie();
 if (Module["postRun"]) {
  if (typeof Module["postRun"] == "function") Module["postRun"] = [ Module["postRun"] ];
  while (Module["postRun"].length) {
   addOnPostRun(Module["postRun"].shift());
  }
 }
 callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
 __ATPRERUN__.unshift(cb);
}

function addOnExit(cb) {
 __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
 __ATPOSTRUN__.unshift(cb);
}

function unSign(value, bits, ignore) {
 if (value >= 0) {
  return value;
 }
 return bits <= 32 ? 2 * Math.abs(1 << bits - 1) + value : Math.pow(2, bits) + value;
}

function reSign(value, bits, ignore) {
 if (value <= 0) {
  return value;
 }
 var half = bits <= 32 ? Math.abs(1 << bits - 1) : Math.pow(2, bits - 1);
 if (value >= half && (bits <= 32 || value > half)) {
  value = -2 * half + value;
 }
 return value;
}

assert(Math.imul, "This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill");

assert(Math.fround, "This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill");

assert(Math.clz32, "This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill");

assert(Math.trunc, "This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill");

var Math_abs = Math.abs;

var Math_sqrt = Math.sqrt;

var Math_ceil = Math.ceil;

var Math_floor = Math.floor;

var Math_fround = Math.fround;

var Math_min = Math.min;

var runDependencies = 0;

var runDependencyWatcher = null;

var dependenciesFulfilled = null;

var runDependencyTracking = {};

function getUniqueRunDependency(id) {
 var orig = id;
 while (1) {
  if (!runDependencyTracking[id]) return id;
  id = orig + Math.random();
 }
 return id;
}

function addRunDependency(id) {
 runDependencies++;
 if (Module["monitorRunDependencies"]) {
  Module["monitorRunDependencies"](runDependencies);
 }
 if (id) {
  assert(!runDependencyTracking[id]);
  runDependencyTracking[id] = 1;
  if (runDependencyWatcher === null && typeof setInterval !== "undefined") {
   runDependencyWatcher = setInterval(function() {
    if (ABORT) {
     clearInterval(runDependencyWatcher);
     runDependencyWatcher = null;
     return;
    }
    var shown = false;
    for (var dep in runDependencyTracking) {
     if (!shown) {
      shown = true;
      err("still waiting on run dependencies:");
     }
     err("dependency: " + dep);
    }
    if (shown) {
     err("(end of list)");
    }
   }, 1e4);
  }
 } else {
  err("warning: run dependency added without ID");
 }
}

function removeRunDependency(id) {
 runDependencies--;
 if (Module["monitorRunDependencies"]) {
  Module["monitorRunDependencies"](runDependencies);
 }
 if (id) {
  assert(runDependencyTracking[id]);
  delete runDependencyTracking[id];
 } else {
  err("warning: run dependency removed without ID");
 }
 if (runDependencies == 0) {
  if (runDependencyWatcher !== null) {
   clearInterval(runDependencyWatcher);
   runDependencyWatcher = null;
  }
  if (dependenciesFulfilled) {
   var callback = dependenciesFulfilled;
   dependenciesFulfilled = null;
   callback();
  }
 }
}

Module["preloadedImages"] = {};

Module["preloadedAudios"] = {};

var dataURIPrefix = "data:application/octet-stream;base64,";

function isDataURI(filename) {
 return String.prototype.startsWith ? filename.startsWith(dataURIPrefix) : filename.indexOf(dataURIPrefix) === 0;
}

var wasmBinaryFile = "hello-full-sysimg.wasm";

if (!isDataURI(wasmBinaryFile)) {
 wasmBinaryFile = locateFile(wasmBinaryFile);
}

function getBinary() {
 try {
  if (Module["wasmBinary"]) {
   return new Uint8Array(Module["wasmBinary"]);
  }
  if (readBinary) {
   return readBinary(wasmBinaryFile);
  } else {
   throw "both async and sync fetching of the wasm failed";
  }
 } catch (err) {
  abort(err);
 }
}

function getBinaryPromise() {
 if (!Module["wasmBinary"] && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === "function") {
  return fetch(wasmBinaryFile, {
   credentials: "same-origin"
  }).then(function(response) {
   if (!response["ok"]) {
    throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
   }
   return response["arrayBuffer"]();
  }).catch(function() {
   return getBinary();
  });
 }
 return new Promise(function(resolve, reject) {
  resolve(getBinary());
 });
}

function createWasm(env) {
 var info = {
  "env": env
 };
 function receiveInstance(instance, module) {
  var exports = instance.exports;
  exports = Asyncify.instrumentWasmExports(exports);
  Module["asm"] = exports;
  removeRunDependency("wasm-instantiate");
 }
 addRunDependency("wasm-instantiate");
 var trueModule = Module;
 function receiveInstantiatedSource(output) {
  assert(Module === trueModule, "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?");
  trueModule = null;
  receiveInstance(output["instance"]);
 }
 function instantiateArrayBuffer(receiver) {
  return getBinaryPromise().then(function(binary) {
   return WebAssembly.instantiate(binary, info);
  }).then(receiver, function(reason) {
   err("failed to asynchronously prepare wasm: " + reason);
   abort(reason);
  });
 }
 function instantiateAsync() {
  if (!Module["wasmBinary"] && typeof WebAssembly.instantiateStreaming === "function" && !isDataURI(wasmBinaryFile) && typeof fetch === "function") {
   fetch(wasmBinaryFile, {
    credentials: "same-origin"
   }).then(function(response) {
    return WebAssembly.instantiateStreaming(response, info).then(receiveInstantiatedSource, function(reason) {
     err("wasm streaming compile failed: " + reason);
     err("falling back to ArrayBuffer instantiation");
     instantiateArrayBuffer(receiveInstantiatedSource);
    });
   });
  } else {
   return instantiateArrayBuffer(receiveInstantiatedSource);
  }
 }
 if (Module["instantiateWasm"]) {
  try {
   var exports = Module["instantiateWasm"](info, receiveInstance);
   exports = Asyncify.instrumentWasmExports(exports);
   return exports;
  } catch (e) {
   err("Module.instantiateWasm callback failed with error: " + e);
   return false;
  }
 }
 instantiateAsync();
 return {};
}

Module["asm"] = function(global, env, providedBuffer) {
 env["memory"] = wasmMemory;
 env["table"] = wasmTable = new WebAssembly.Table({
  "initial": 11105,
  "maximum": 11105 + 20,
  "element": "anyfunc"
 });
 var exports = createWasm(env);
 assert(exports, "binaryen setup failed (no wasm support?)");
 return exports;
};

var tempDouble;

var tempI64;

__ATINIT__.push({
 func: function() {
  ___wasm_call_ctors();
 }
});

function ___assert_fail(condition, filename, line, func) {
 var originalAsyncifyState = Asyncify.state;
 try {
  abort("Assertion failed: " + UTF8ToString(condition) + ", at: " + [ filename ? UTF8ToString(filename) : "unknown filename", line, func ? UTF8ToString(func) : "unknown function" ]);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __assert_fail was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

var ENV = {};

function ___buildEnvironment(environ) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var MAX_ENV_VALUES = 64;
  var TOTAL_ENV_SIZE = 1024;
  var poolPtr;
  var envPtr;
  if (!___buildEnvironment.called) {
   ___buildEnvironment.called = true;
   ENV["USER"] = ENV["LOGNAME"] = "web_user";
   ENV["PATH"] = "/";
   ENV["PWD"] = "/";
   ENV["HOME"] = "/home/web_user";
   ENV["LANG"] = "C.UTF-8";
   ENV["LANG"] = (typeof navigator === "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8";
   ENV["_"] = thisProgram;
   poolPtr = getMemory(TOTAL_ENV_SIZE);
   envPtr = getMemory(MAX_ENV_VALUES * 4);
   SAFE_HEAP_STORE(envPtr | 0, poolPtr | 0, 4);
   SAFE_HEAP_STORE(environ | 0, envPtr | 0, 4);
  } else {
   envPtr = SAFE_HEAP_LOAD(environ | 0, 4, 0) | 0;
   poolPtr = SAFE_HEAP_LOAD(envPtr | 0, 4, 0) | 0;
  }
  var strings = [];
  var totalSize = 0;
  for (var key in ENV) {
   if (typeof ENV[key] === "string") {
    var line = key + "=" + ENV[key];
    strings.push(line);
    totalSize += line.length;
   }
  }
  if (totalSize > TOTAL_ENV_SIZE) {
   throw new Error("Environment size exceeded TOTAL_ENV_SIZE!");
  }
  var ptrSize = 4;
  for (var i = 0; i < strings.length; i++) {
   var line = strings[i];
   writeAsciiToMemory(line, poolPtr);
   SAFE_HEAP_STORE(envPtr + i * ptrSize | 0, poolPtr | 0, 4);
   poolPtr += line.length + 1;
  }
  SAFE_HEAP_STORE(envPtr + strings.length * ptrSize | 0, 0 | 0, 4);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __buildEnvironment was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_now() {
 var originalAsyncifyState = Asyncify.state;
 try {
  abort();
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_now was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_now_is_monotonic() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return 0 || ENVIRONMENT_IS_NODE || typeof dateNow !== "undefined" || typeof performance === "object" && performance && typeof performance["now"] === "function";
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_now_is_monotonic was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___setErrNo(value) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (Module["___errno_location"]) SAFE_HEAP_STORE(Module["___errno_location"]() | 0, value | 0, 4); else err("failed to set errno from JS");
  return value;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __setErrNo was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _clock_gettime(clk_id, tp) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var now;
  if (clk_id === 0) {
   now = Date.now();
  } else if (clk_id === 1 && _emscripten_get_now_is_monotonic()) {
   now = _emscripten_get_now();
  } else {
   ___setErrNo(22);
   return -1;
  }
  SAFE_HEAP_STORE(tp | 0, now / 1e3 | 0 | 0, 4);
  SAFE_HEAP_STORE(tp + 4 | 0, now % 1e3 * 1e3 * 1e3 | 0 | 0, 4);
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import clock_gettime was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___clock_gettime(a0, a1) {
 var originalAsyncifyState = Asyncify.state;
 try {
  return _clock_gettime(a0, a1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __clock_gettime was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _atexit(func, arg) {
 var originalAsyncifyState = Asyncify.state;
 try {
  __ATEXIT__.unshift({
   func: func,
   arg: arg
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import atexit was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___cxa_atexit() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return _atexit.apply(null, arguments);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __cxa_atexit was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___cxa_pure_virtual() {
 var originalAsyncifyState = Asyncify.state;
 try {
  ABORT = true;
  throw "Pure virtual function called!";
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __cxa_pure_virtual was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___lock() {
 var originalAsyncifyState = Asyncify.state;
 try {} finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __lock was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___map_file(pathname, size) {
 var originalAsyncifyState = Asyncify.state;
 try {
  ___setErrNo(1);
  return -1;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __map_file was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

var PATH = {
 splitPath: function(filename) {
  var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
  return splitPathRe.exec(filename).slice(1);
 },
 normalizeArray: function(parts, allowAboveRoot) {
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
   var last = parts[i];
   if (last === ".") {
    parts.splice(i, 1);
   } else if (last === "..") {
    parts.splice(i, 1);
    up++;
   } else if (up) {
    parts.splice(i, 1);
    up--;
   }
  }
  if (allowAboveRoot) {
   for (;up; up--) {
    parts.unshift("..");
   }
  }
  return parts;
 },
 normalize: function(path) {
  var isAbsolute = path.charAt(0) === "/", trailingSlash = path.substr(-1) === "/";
  path = PATH.normalizeArray(path.split("/").filter(function(p) {
   return !!p;
  }), !isAbsolute).join("/");
  if (!path && !isAbsolute) {
   path = ".";
  }
  if (path && trailingSlash) {
   path += "/";
  }
  return (isAbsolute ? "/" : "") + path;
 },
 dirname: function(path) {
  var result = PATH.splitPath(path), root = result[0], dir = result[1];
  if (!root && !dir) {
   return ".";
  }
  if (dir) {
   dir = dir.substr(0, dir.length - 1);
  }
  return root + dir;
 },
 basename: function(path) {
  if (path === "/") return "/";
  var lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) return path;
  return path.substr(lastSlash + 1);
 },
 extname: function(path) {
  return PATH.splitPath(path)[3];
 },
 join: function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return PATH.normalize(paths.join("/"));
 },
 join2: function(l, r) {
  return PATH.normalize(l + "/" + r);
 }
};

var PATH_FS = {
 resolve: function() {
  var resolvedPath = "", resolvedAbsolute = false;
  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
   var path = i >= 0 ? arguments[i] : FS.cwd();
   if (typeof path !== "string") {
    throw new TypeError("Arguments to path.resolve must be strings");
   } else if (!path) {
    return "";
   }
   resolvedPath = path + "/" + resolvedPath;
   resolvedAbsolute = path.charAt(0) === "/";
  }
  resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter(function(p) {
   return !!p;
  }), !resolvedAbsolute).join("/");
  return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
 },
 relative: function(from, to) {
  from = PATH_FS.resolve(from).substr(1);
  to = PATH_FS.resolve(to).substr(1);
  function trim(arr) {
   var start = 0;
   for (;start < arr.length; start++) {
    if (arr[start] !== "") break;
   }
   var end = arr.length - 1;
   for (;end >= 0; end--) {
    if (arr[end] !== "") break;
   }
   if (start > end) return [];
   return arr.slice(start, end - start + 1);
  }
  var fromParts = trim(from.split("/"));
  var toParts = trim(to.split("/"));
  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
   if (fromParts[i] !== toParts[i]) {
    samePartsLength = i;
    break;
   }
  }
  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
   outputParts.push("..");
  }
  outputParts = outputParts.concat(toParts.slice(samePartsLength));
  return outputParts.join("/");
 }
};

var TTY = {
 ttys: [],
 init: function() {},
 shutdown: function() {},
 register: function(dev, ops) {
  TTY.ttys[dev] = {
   input: [],
   output: [],
   ops: ops
  };
  FS.registerDevice(dev, TTY.stream_ops);
 },
 stream_ops: {
  open: function(stream) {
   var tty = TTY.ttys[stream.node.rdev];
   if (!tty) {
    throw new FS.ErrnoError(19);
   }
   stream.tty = tty;
   stream.seekable = false;
  },
  close: function(stream) {
   stream.tty.ops.flush(stream.tty);
  },
  flush: function(stream) {
   stream.tty.ops.flush(stream.tty);
  },
  read: function(stream, buffer, offset, length, pos) {
   if (!stream.tty || !stream.tty.ops.get_char) {
    throw new FS.ErrnoError(6);
   }
   var bytesRead = 0;
   for (var i = 0; i < length; i++) {
    var result;
    try {
     result = stream.tty.ops.get_char(stream.tty);
    } catch (e) {
     throw new FS.ErrnoError(5);
    }
    if (result === undefined && bytesRead === 0) {
     throw new FS.ErrnoError(11);
    }
    if (result === null || result === undefined) break;
    bytesRead++;
    buffer[offset + i] = result;
   }
   if (bytesRead) {
    stream.node.timestamp = Date.now();
   }
   return bytesRead;
  },
  write: function(stream, buffer, offset, length, pos) {
   if (!stream.tty || !stream.tty.ops.put_char) {
    throw new FS.ErrnoError(6);
   }
   try {
    for (var i = 0; i < length; i++) {
     stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
    }
   } catch (e) {
    throw new FS.ErrnoError(5);
   }
   if (length) {
    stream.node.timestamp = Date.now();
   }
   return i;
  }
 },
 default_tty_ops: {
  get_char: function(tty) {
   if (!tty.input.length) {
    var result = null;
    if (ENVIRONMENT_IS_NODE) {
     var BUFSIZE = 256;
     var buf = Buffer.alloc ? Buffer.alloc(BUFSIZE) : new Buffer(BUFSIZE);
     var bytesRead = 0;
     var isPosixPlatform = process.platform != "win32";
     var fd = process.stdin.fd;
     if (isPosixPlatform) {
      var usingDevice = false;
      try {
       fd = fs.openSync("/dev/stdin", "r");
       usingDevice = true;
      } catch (e) {}
     }
     try {
      bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null);
     } catch (e) {
      if (e.toString().indexOf("EOF") != -1) bytesRead = 0; else throw e;
     }
     if (usingDevice) {
      fs.closeSync(fd);
     }
     if (bytesRead > 0) {
      result = buf.slice(0, bytesRead).toString("utf-8");
     } else {
      result = null;
     }
    } else if (typeof window != "undefined" && typeof window.prompt == "function") {
     result = window.prompt("Input: ");
     if (result !== null) {
      result += "\n";
     }
    } else if (typeof readline == "function") {
     result = readline();
     if (result !== null) {
      result += "\n";
     }
    }
    if (!result) {
     return null;
    }
    tty.input = intArrayFromString(result, true);
   }
   return tty.input.shift();
  },
  put_char: function(tty, val) {
   if (val === null || val === 10) {
    out(UTF8ArrayToString(tty.output, 0));
    tty.output = [];
   } else {
    if (val != 0) tty.output.push(val);
   }
  },
  flush: function(tty) {
   if (tty.output && tty.output.length > 0) {
    out(UTF8ArrayToString(tty.output, 0));
    tty.output = [];
   }
  }
 },
 default_tty1_ops: {
  put_char: function(tty, val) {
   if (val === null || val === 10) {
    err(UTF8ArrayToString(tty.output, 0));
    tty.output = [];
   } else {
    if (val != 0) tty.output.push(val);
   }
  },
  flush: function(tty) {
   if (tty.output && tty.output.length > 0) {
    err(UTF8ArrayToString(tty.output, 0));
    tty.output = [];
   }
  }
 }
};

var MEMFS = {
 ops_table: null,
 mount: function(mount) {
  return MEMFS.createNode(null, "/", 16384 | 511, 0);
 },
 createNode: function(parent, name, mode, dev) {
  if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
   throw new FS.ErrnoError(1);
  }
  if (!MEMFS.ops_table) {
   MEMFS.ops_table = {
    dir: {
     node: {
      getattr: MEMFS.node_ops.getattr,
      setattr: MEMFS.node_ops.setattr,
      lookup: MEMFS.node_ops.lookup,
      mknod: MEMFS.node_ops.mknod,
      rename: MEMFS.node_ops.rename,
      unlink: MEMFS.node_ops.unlink,
      rmdir: MEMFS.node_ops.rmdir,
      readdir: MEMFS.node_ops.readdir,
      symlink: MEMFS.node_ops.symlink
     },
     stream: {
      llseek: MEMFS.stream_ops.llseek
     }
    },
    file: {
     node: {
      getattr: MEMFS.node_ops.getattr,
      setattr: MEMFS.node_ops.setattr
     },
     stream: {
      llseek: MEMFS.stream_ops.llseek,
      read: MEMFS.stream_ops.read,
      write: MEMFS.stream_ops.write,
      allocate: MEMFS.stream_ops.allocate,
      mmap: MEMFS.stream_ops.mmap,
      msync: MEMFS.stream_ops.msync
     }
    },
    link: {
     node: {
      getattr: MEMFS.node_ops.getattr,
      setattr: MEMFS.node_ops.setattr,
      readlink: MEMFS.node_ops.readlink
     },
     stream: {}
    },
    chrdev: {
     node: {
      getattr: MEMFS.node_ops.getattr,
      setattr: MEMFS.node_ops.setattr
     },
     stream: FS.chrdev_stream_ops
    }
   };
  }
  var node = FS.createNode(parent, name, mode, dev);
  if (FS.isDir(node.mode)) {
   node.node_ops = MEMFS.ops_table.dir.node;
   node.stream_ops = MEMFS.ops_table.dir.stream;
   node.contents = {};
  } else if (FS.isFile(node.mode)) {
   node.node_ops = MEMFS.ops_table.file.node;
   node.stream_ops = MEMFS.ops_table.file.stream;
   node.usedBytes = 0;
   node.contents = null;
  } else if (FS.isLink(node.mode)) {
   node.node_ops = MEMFS.ops_table.link.node;
   node.stream_ops = MEMFS.ops_table.link.stream;
  } else if (FS.isChrdev(node.mode)) {
   node.node_ops = MEMFS.ops_table.chrdev.node;
   node.stream_ops = MEMFS.ops_table.chrdev.stream;
  }
  node.timestamp = Date.now();
  if (parent) {
   parent.contents[name] = node;
  }
  return node;
 },
 getFileDataAsRegularArray: function(node) {
  if (node.contents && node.contents.subarray) {
   var arr = [];
   for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
   return arr;
  }
  return node.contents;
 },
 getFileDataAsTypedArray: function(node) {
  if (!node.contents) return new Uint8Array();
  if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
  return new Uint8Array(node.contents);
 },
 expandFileStorage: function(node, newCapacity) {
  var prevCapacity = node.contents ? node.contents.length : 0;
  if (prevCapacity >= newCapacity) return;
  var CAPACITY_DOUBLING_MAX = 1024 * 1024;
  newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) | 0);
  if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
  var oldContents = node.contents;
  node.contents = new Uint8Array(newCapacity);
  if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
  return;
 },
 resizeFileStorage: function(node, newSize) {
  if (node.usedBytes == newSize) return;
  if (newSize == 0) {
   node.contents = null;
   node.usedBytes = 0;
   return;
  }
  if (!node.contents || node.contents.subarray) {
   var oldContents = node.contents;
   node.contents = new Uint8Array(new ArrayBuffer(newSize));
   if (oldContents) {
    node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
   }
   node.usedBytes = newSize;
   return;
  }
  if (!node.contents) node.contents = [];
  if (node.contents.length > newSize) node.contents.length = newSize; else while (node.contents.length < newSize) node.contents.push(0);
  node.usedBytes = newSize;
 },
 node_ops: {
  getattr: function(node) {
   var attr = {};
   attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
   attr.ino = node.id;
   attr.mode = node.mode;
   attr.nlink = 1;
   attr.uid = 0;
   attr.gid = 0;
   attr.rdev = node.rdev;
   if (FS.isDir(node.mode)) {
    attr.size = 4096;
   } else if (FS.isFile(node.mode)) {
    attr.size = node.usedBytes;
   } else if (FS.isLink(node.mode)) {
    attr.size = node.link.length;
   } else {
    attr.size = 0;
   }
   attr.atime = new Date(node.timestamp);
   attr.mtime = new Date(node.timestamp);
   attr.ctime = new Date(node.timestamp);
   attr.blksize = 4096;
   attr.blocks = Math.ceil(attr.size / attr.blksize);
   return attr;
  },
  setattr: function(node, attr) {
   if (attr.mode !== undefined) {
    node.mode = attr.mode;
   }
   if (attr.timestamp !== undefined) {
    node.timestamp = attr.timestamp;
   }
   if (attr.size !== undefined) {
    MEMFS.resizeFileStorage(node, attr.size);
   }
  },
  lookup: function(parent, name) {
   throw FS.genericErrors[2];
  },
  mknod: function(parent, name, mode, dev) {
   return MEMFS.createNode(parent, name, mode, dev);
  },
  rename: function(old_node, new_dir, new_name) {
   if (FS.isDir(old_node.mode)) {
    var new_node;
    try {
     new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {}
    if (new_node) {
     for (var i in new_node.contents) {
      throw new FS.ErrnoError(39);
     }
    }
   }
   delete old_node.parent.contents[old_node.name];
   old_node.name = new_name;
   new_dir.contents[new_name] = old_node;
   old_node.parent = new_dir;
  },
  unlink: function(parent, name) {
   delete parent.contents[name];
  },
  rmdir: function(parent, name) {
   var node = FS.lookupNode(parent, name);
   for (var i in node.contents) {
    throw new FS.ErrnoError(39);
   }
   delete parent.contents[name];
  },
  readdir: function(node) {
   var entries = [ ".", ".." ];
   for (var key in node.contents) {
    if (!node.contents.hasOwnProperty(key)) {
     continue;
    }
    entries.push(key);
   }
   return entries;
  },
  symlink: function(parent, newname, oldpath) {
   var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
   node.link = oldpath;
   return node;
  },
  readlink: function(node) {
   if (!FS.isLink(node.mode)) {
    throw new FS.ErrnoError(22);
   }
   return node.link;
  }
 },
 stream_ops: {
  read: function(stream, buffer, offset, length, position) {
   var contents = stream.node.contents;
   if (position >= stream.node.usedBytes) return 0;
   var size = Math.min(stream.node.usedBytes - position, length);
   assert(size >= 0);
   if (size > 8 && contents.subarray) {
    buffer.set(contents.subarray(position, position + size), offset);
   } else {
    for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
   }
   return size;
  },
  write: function(stream, buffer, offset, length, position, canOwn) {
   if (canOwn) {
    warnOnce("file packager has copied file data into memory, but in memory growth we are forced to copy it again (see --no-heap-copy)");
   }
   canOwn = false;
   if (!length) return 0;
   var node = stream.node;
   node.timestamp = Date.now();
   if (buffer.subarray && (!node.contents || node.contents.subarray)) {
    if (canOwn) {
     assert(position === 0, "canOwn must imply no weird position inside the file");
     node.contents = buffer.subarray(offset, offset + length);
     node.usedBytes = length;
     return length;
    } else if (node.usedBytes === 0 && position === 0) {
     node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
     node.usedBytes = length;
     return length;
    } else if (position + length <= node.usedBytes) {
     node.contents.set(buffer.subarray(offset, offset + length), position);
     return length;
    }
   }
   MEMFS.expandFileStorage(node, position + length);
   if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position); else {
    for (var i = 0; i < length; i++) {
     node.contents[position + i] = buffer[offset + i];
    }
   }
   node.usedBytes = Math.max(node.usedBytes, position + length);
   return length;
  },
  llseek: function(stream, offset, whence) {
   var position = offset;
   if (whence === 1) {
    position += stream.position;
   } else if (whence === 2) {
    if (FS.isFile(stream.node.mode)) {
     position += stream.node.usedBytes;
    }
   }
   if (position < 0) {
    throw new FS.ErrnoError(22);
   }
   return position;
  },
  allocate: function(stream, offset, length) {
   MEMFS.expandFileStorage(stream.node, offset + length);
   stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
  },
  mmap: function(stream, buffer, offset, length, position, prot, flags) {
   if (!FS.isFile(stream.node.mode)) {
    throw new FS.ErrnoError(19);
   }
   var ptr;
   var allocated;
   var contents = stream.node.contents;
   if (!(flags & 2) && (contents.buffer === buffer || contents.buffer === buffer.buffer)) {
    allocated = false;
    ptr = contents.byteOffset;
   } else {
    if (position > 0 || position + length < stream.node.usedBytes) {
     if (contents.subarray) {
      contents = contents.subarray(position, position + length);
     } else {
      contents = Array.prototype.slice.call(contents, position, position + length);
     }
    }
    allocated = true;
    ptr = _malloc(length);
    if (!ptr) {
     throw new FS.ErrnoError(12);
    }
    buffer.set(contents, ptr);
   }
   return {
    ptr: ptr,
    allocated: allocated
   };
  },
  msync: function(stream, buffer, offset, length, mmapFlags) {
   if (!FS.isFile(stream.node.mode)) {
    throw new FS.ErrnoError(19);
   }
   if (mmapFlags & 2) {
    return 0;
   }
   var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
   return 0;
  }
 }
};

var IDBFS = {
 dbs: {},
 indexedDB: function() {
  if (typeof indexedDB !== "undefined") return indexedDB;
  var ret = null;
  if (typeof window === "object") ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
  assert(ret, "IDBFS used, but indexedDB not supported");
  return ret;
 },
 DB_VERSION: 21,
 DB_STORE_NAME: "FILE_DATA",
 mount: function(mount) {
  return MEMFS.mount.apply(null, arguments);
 },
 syncfs: function(mount, populate, callback) {
  IDBFS.getLocalSet(mount, function(err, local) {
   if (err) return callback(err);
   IDBFS.getRemoteSet(mount, function(err, remote) {
    if (err) return callback(err);
    var src = populate ? remote : local;
    var dst = populate ? local : remote;
    IDBFS.reconcile(src, dst, callback);
   });
  });
 },
 getDB: function(name, callback) {
  var db = IDBFS.dbs[name];
  if (db) {
   return callback(null, db);
  }
  var req;
  try {
   req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
  } catch (e) {
   return callback(e);
  }
  if (!req) {
   return callback("Unable to connect to IndexedDB");
  }
  req.onupgradeneeded = function(e) {
   var db = e.target.result;
   var transaction = e.target.transaction;
   var fileStore;
   if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
    fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
   } else {
    fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
   }
   if (!fileStore.indexNames.contains("timestamp")) {
    fileStore.createIndex("timestamp", "timestamp", {
     unique: false
    });
   }
  };
  req.onsuccess = function() {
   db = req.result;
   IDBFS.dbs[name] = db;
   callback(null, db);
  };
  req.onerror = function(e) {
   callback(this.error);
   e.preventDefault();
  };
 },
 getLocalSet: function(mount, callback) {
  var entries = {};
  function isRealDir(p) {
   return p !== "." && p !== "..";
  }
  function toAbsolute(root) {
   return function(p) {
    return PATH.join2(root, p);
   };
  }
  var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
  while (check.length) {
   var path = check.pop();
   var stat;
   try {
    stat = FS.stat(path);
   } catch (e) {
    return callback(e);
   }
   if (FS.isDir(stat.mode)) {
    check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
   }
   entries[path] = {
    timestamp: stat.mtime
   };
  }
  return callback(null, {
   type: "local",
   entries: entries
  });
 },
 getRemoteSet: function(mount, callback) {
  var entries = {};
  IDBFS.getDB(mount.mountpoint, function(err, db) {
   if (err) return callback(err);
   try {
    var transaction = db.transaction([ IDBFS.DB_STORE_NAME ], "readonly");
    transaction.onerror = function(e) {
     callback(this.error);
     e.preventDefault();
    };
    var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
    var index = store.index("timestamp");
    index.openKeyCursor().onsuccess = function(event) {
     var cursor = event.target.result;
     if (!cursor) {
      return callback(null, {
       type: "remote",
       db: db,
       entries: entries
      });
     }
     entries[cursor.primaryKey] = {
      timestamp: cursor.key
     };
     cursor.continue();
    };
   } catch (e) {
    return callback(e);
   }
  });
 },
 loadLocalEntry: function(path, callback) {
  var stat, node;
  try {
   var lookup = FS.lookupPath(path);
   node = lookup.node;
   stat = FS.stat(path);
  } catch (e) {
   return callback(e);
  }
  if (FS.isDir(stat.mode)) {
   return callback(null, {
    timestamp: stat.mtime,
    mode: stat.mode
   });
  } else if (FS.isFile(stat.mode)) {
   node.contents = MEMFS.getFileDataAsTypedArray(node);
   return callback(null, {
    timestamp: stat.mtime,
    mode: stat.mode,
    contents: node.contents
   });
  } else {
   return callback(new Error("node type not supported"));
  }
 },
 storeLocalEntry: function(path, entry, callback) {
  try {
   if (FS.isDir(entry.mode)) {
    FS.mkdir(path, entry.mode);
   } else if (FS.isFile(entry.mode)) {
    FS.writeFile(path, entry.contents, {
     canOwn: true
    });
   } else {
    return callback(new Error("node type not supported"));
   }
   FS.chmod(path, entry.mode);
   FS.utime(path, entry.timestamp, entry.timestamp);
  } catch (e) {
   return callback(e);
  }
  callback(null);
 },
 removeLocalEntry: function(path, callback) {
  try {
   var lookup = FS.lookupPath(path);
   var stat = FS.stat(path);
   if (FS.isDir(stat.mode)) {
    FS.rmdir(path);
   } else if (FS.isFile(stat.mode)) {
    FS.unlink(path);
   }
  } catch (e) {
   return callback(e);
  }
  callback(null);
 },
 loadRemoteEntry: function(store, path, callback) {
  var req = store.get(path);
  req.onsuccess = function(event) {
   callback(null, event.target.result);
  };
  req.onerror = function(e) {
   callback(this.error);
   e.preventDefault();
  };
 },
 storeRemoteEntry: function(store, path, entry, callback) {
  var req = store.put(entry, path);
  req.onsuccess = function() {
   callback(null);
  };
  req.onerror = function(e) {
   callback(this.error);
   e.preventDefault();
  };
 },
 removeRemoteEntry: function(store, path, callback) {
  var req = store.delete(path);
  req.onsuccess = function() {
   callback(null);
  };
  req.onerror = function(e) {
   callback(this.error);
   e.preventDefault();
  };
 },
 reconcile: function(src, dst, callback) {
  var total = 0;
  var create = [];
  Object.keys(src.entries).forEach(function(key) {
   var e = src.entries[key];
   var e2 = dst.entries[key];
   if (!e2 || e.timestamp > e2.timestamp) {
    create.push(key);
    total++;
   }
  });
  var remove = [];
  Object.keys(dst.entries).forEach(function(key) {
   var e = dst.entries[key];
   var e2 = src.entries[key];
   if (!e2) {
    remove.push(key);
    total++;
   }
  });
  if (!total) {
   return callback(null);
  }
  var errored = false;
  var db = src.type === "remote" ? src.db : dst.db;
  var transaction = db.transaction([ IDBFS.DB_STORE_NAME ], "readwrite");
  var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
  function done(err) {
   if (err && !errored) {
    errored = true;
    return callback(err);
   }
  }
  transaction.onerror = function(e) {
   done(this.error);
   e.preventDefault();
  };
  transaction.oncomplete = function(e) {
   if (!errored) {
    callback(null);
   }
  };
  create.sort().forEach(function(path) {
   if (dst.type === "local") {
    IDBFS.loadRemoteEntry(store, path, function(err, entry) {
     if (err) return done(err);
     IDBFS.storeLocalEntry(path, entry, done);
    });
   } else {
    IDBFS.loadLocalEntry(path, function(err, entry) {
     if (err) return done(err);
     IDBFS.storeRemoteEntry(store, path, entry, done);
    });
   }
  });
  remove.sort().reverse().forEach(function(path) {
   if (dst.type === "local") {
    IDBFS.removeLocalEntry(path, done);
   } else {
    IDBFS.removeRemoteEntry(store, path, done);
   }
  });
 }
};

var NODEFS = {
 isWindows: false,
 staticInit: function() {
  NODEFS.isWindows = !!process.platform.match(/^win/);
  var flags = process["binding"]("constants");
  if (flags["fs"]) {
   flags = flags["fs"];
  }
  NODEFS.flagsForNodeMap = {
   1024: flags["O_APPEND"],
   64: flags["O_CREAT"],
   128: flags["O_EXCL"],
   0: flags["O_RDONLY"],
   2: flags["O_RDWR"],
   4096: flags["O_SYNC"],
   512: flags["O_TRUNC"],
   1: flags["O_WRONLY"]
  };
 },
 bufferFrom: function(arrayBuffer) {
  return Buffer.alloc ? Buffer.from(arrayBuffer) : new Buffer(arrayBuffer);
 },
 mount: function(mount) {
  assert(ENVIRONMENT_HAS_NODE);
  return NODEFS.createNode(null, "/", NODEFS.getMode(mount.opts.root), 0);
 },
 createNode: function(parent, name, mode, dev) {
  if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
   throw new FS.ErrnoError(22);
  }
  var node = FS.createNode(parent, name, mode);
  node.node_ops = NODEFS.node_ops;
  node.stream_ops = NODEFS.stream_ops;
  return node;
 },
 getMode: function(path) {
  var stat;
  try {
   stat = fs.lstatSync(path);
   if (NODEFS.isWindows) {
    stat.mode = stat.mode | (stat.mode & 292) >> 2;
   }
  } catch (e) {
   if (!e.code) throw e;
   throw new FS.ErrnoError(-e.errno);
  }
  return stat.mode;
 },
 realPath: function(node) {
  var parts = [];
  while (node.parent !== node) {
   parts.push(node.name);
   node = node.parent;
  }
  parts.push(node.mount.opts.root);
  parts.reverse();
  return PATH.join.apply(null, parts);
 },
 flagsForNode: function(flags) {
  flags &= ~2097152;
  flags &= ~2048;
  flags &= ~32768;
  flags &= ~524288;
  var newFlags = 0;
  for (var k in NODEFS.flagsForNodeMap) {
   if (flags & k) {
    newFlags |= NODEFS.flagsForNodeMap[k];
    flags ^= k;
   }
  }
  if (!flags) {
   return newFlags;
  } else {
   throw new FS.ErrnoError(22);
  }
 },
 node_ops: {
  getattr: function(node) {
   var path = NODEFS.realPath(node);
   var stat;
   try {
    stat = fs.lstatSync(path);
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
   if (NODEFS.isWindows && !stat.blksize) {
    stat.blksize = 4096;
   }
   if (NODEFS.isWindows && !stat.blocks) {
    stat.blocks = (stat.size + stat.blksize - 1) / stat.blksize | 0;
   }
   return {
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    gid: stat.gid,
    rdev: stat.rdev,
    size: stat.size,
    atime: stat.atime,
    mtime: stat.mtime,
    ctime: stat.ctime,
    blksize: stat.blksize,
    blocks: stat.blocks
   };
  },
  setattr: function(node, attr) {
   var path = NODEFS.realPath(node);
   try {
    if (attr.mode !== undefined) {
     fs.chmodSync(path, attr.mode);
     node.mode = attr.mode;
    }
    if (attr.timestamp !== undefined) {
     var date = new Date(attr.timestamp);
     fs.utimesSync(path, date, date);
    }
    if (attr.size !== undefined) {
     fs.truncateSync(path, attr.size);
    }
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
  },
  lookup: function(parent, name) {
   var path = PATH.join2(NODEFS.realPath(parent), name);
   var mode = NODEFS.getMode(path);
   return NODEFS.createNode(parent, name, mode);
  },
  mknod: function(parent, name, mode, dev) {
   var node = NODEFS.createNode(parent, name, mode, dev);
   var path = NODEFS.realPath(node);
   try {
    if (FS.isDir(node.mode)) {
     fs.mkdirSync(path, node.mode);
    } else {
     fs.writeFileSync(path, "", {
      mode: node.mode
     });
    }
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
   return node;
  },
  rename: function(oldNode, newDir, newName) {
   var oldPath = NODEFS.realPath(oldNode);
   var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
   try {
    fs.renameSync(oldPath, newPath);
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
  },
  unlink: function(parent, name) {
   var path = PATH.join2(NODEFS.realPath(parent), name);
   try {
    fs.unlinkSync(path);
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
  },
  rmdir: function(parent, name) {
   var path = PATH.join2(NODEFS.realPath(parent), name);
   try {
    fs.rmdirSync(path);
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
  },
  readdir: function(node) {
   var path = NODEFS.realPath(node);
   try {
    return fs.readdirSync(path);
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
  },
  symlink: function(parent, newName, oldPath) {
   var newPath = PATH.join2(NODEFS.realPath(parent), newName);
   try {
    fs.symlinkSync(oldPath, newPath);
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
  },
  readlink: function(node) {
   var path = NODEFS.realPath(node);
   try {
    path = fs.readlinkSync(path);
    path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
    return path;
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
  }
 },
 stream_ops: {
  open: function(stream) {
   var path = NODEFS.realPath(stream.node);
   try {
    if (FS.isFile(stream.node.mode)) {
     stream.nfd = fs.openSync(path, NODEFS.flagsForNode(stream.flags));
    }
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
  },
  close: function(stream) {
   try {
    if (FS.isFile(stream.node.mode) && stream.nfd) {
     fs.closeSync(stream.nfd);
    }
   } catch (e) {
    if (!e.code) throw e;
    throw new FS.ErrnoError(-e.errno);
   }
  },
  read: function(stream, buffer, offset, length, position) {
   if (length === 0) return 0;
   try {
    return fs.readSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
   } catch (e) {
    throw new FS.ErrnoError(-e.errno);
   }
  },
  write: function(stream, buffer, offset, length, position) {
   try {
    return fs.writeSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
   } catch (e) {
    throw new FS.ErrnoError(-e.errno);
   }
  },
  llseek: function(stream, offset, whence) {
   var position = offset;
   if (whence === 1) {
    position += stream.position;
   } else if (whence === 2) {
    if (FS.isFile(stream.node.mode)) {
     try {
      var stat = fs.fstatSync(stream.nfd);
      position += stat.size;
     } catch (e) {
      throw new FS.ErrnoError(-e.errno);
     }
    }
   }
   if (position < 0) {
    throw new FS.ErrnoError(22);
   }
   return position;
  }
 }
};

var WORKERFS = {
 DIR_MODE: 16895,
 FILE_MODE: 33279,
 reader: null,
 mount: function(mount) {
  assert(ENVIRONMENT_IS_WORKER);
  if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
  var root = WORKERFS.createNode(null, "/", WORKERFS.DIR_MODE, 0);
  var createdParents = {};
  function ensureParent(path) {
   var parts = path.split("/");
   var parent = root;
   for (var i = 0; i < parts.length - 1; i++) {
    var curr = parts.slice(0, i + 1).join("/");
    if (!createdParents[curr]) {
     createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
    }
    parent = createdParents[curr];
   }
   return parent;
  }
  function base(path) {
   var parts = path.split("/");
   return parts[parts.length - 1];
  }
  Array.prototype.forEach.call(mount.opts["files"] || [], function(file) {
   WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate);
  });
  (mount.opts["blobs"] || []).forEach(function(obj) {
   WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"]);
  });
  (mount.opts["packages"] || []).forEach(function(pack) {
   pack["metadata"].files.forEach(function(file) {
    var name = file.filename.substr(1);
    WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack["blob"].slice(file.start, file.end));
   });
  });
  return root;
 },
 createNode: function(parent, name, mode, dev, contents, mtime) {
  var node = FS.createNode(parent, name, mode);
  node.mode = mode;
  node.node_ops = WORKERFS.node_ops;
  node.stream_ops = WORKERFS.stream_ops;
  node.timestamp = (mtime || new Date()).getTime();
  assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
  if (mode === WORKERFS.FILE_MODE) {
   node.size = contents.size;
   node.contents = contents;
  } else {
   node.size = 4096;
   node.contents = {};
  }
  if (parent) {
   parent.contents[name] = node;
  }
  return node;
 },
 node_ops: {
  getattr: function(node) {
   return {
    dev: 1,
    ino: undefined,
    mode: node.mode,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: undefined,
    size: node.size,
    atime: new Date(node.timestamp),
    mtime: new Date(node.timestamp),
    ctime: new Date(node.timestamp),
    blksize: 4096,
    blocks: Math.ceil(node.size / 4096)
   };
  },
  setattr: function(node, attr) {
   if (attr.mode !== undefined) {
    node.mode = attr.mode;
   }
   if (attr.timestamp !== undefined) {
    node.timestamp = attr.timestamp;
   }
  },
  lookup: function(parent, name) {
   throw new FS.ErrnoError(2);
  },
  mknod: function(parent, name, mode, dev) {
   throw new FS.ErrnoError(1);
  },
  rename: function(oldNode, newDir, newName) {
   throw new FS.ErrnoError(1);
  },
  unlink: function(parent, name) {
   throw new FS.ErrnoError(1);
  },
  rmdir: function(parent, name) {
   throw new FS.ErrnoError(1);
  },
  readdir: function(node) {
   var entries = [ ".", ".." ];
   for (var key in node.contents) {
    if (!node.contents.hasOwnProperty(key)) {
     continue;
    }
    entries.push(key);
   }
   return entries;
  },
  symlink: function(parent, newName, oldPath) {
   throw new FS.ErrnoError(1);
  },
  readlink: function(node) {
   throw new FS.ErrnoError(1);
  }
 },
 stream_ops: {
  read: function(stream, buffer, offset, length, position) {
   if (position >= stream.node.size) return 0;
   var chunk = stream.node.contents.slice(position, position + length);
   var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
   buffer.set(new Uint8Array(ab), offset);
   return chunk.size;
  },
  write: function(stream, buffer, offset, length, position) {
   throw new FS.ErrnoError(5);
  },
  llseek: function(stream, offset, whence) {
   var position = offset;
   if (whence === 1) {
    position += stream.position;
   } else if (whence === 2) {
    if (FS.isFile(stream.node.mode)) {
     position += stream.node.size;
    }
   }
   if (position < 0) {
    throw new FS.ErrnoError(22);
   }
   return position;
  }
 }
};

var ERRNO_MESSAGES = {
 0: "Success",
 1: "Not super-user",
 2: "No such file or directory",
 3: "No such process",
 4: "Interrupted system call",
 5: "I/O error",
 6: "No such device or address",
 7: "Arg list too long",
 8: "Exec format error",
 9: "Bad file number",
 10: "No children",
 11: "No more processes",
 12: "Not enough core",
 13: "Permission denied",
 14: "Bad address",
 15: "Block device required",
 16: "Mount device busy",
 17: "File exists",
 18: "Cross-device link",
 19: "No such device",
 20: "Not a directory",
 21: "Is a directory",
 22: "Invalid argument",
 23: "Too many open files in system",
 24: "Too many open files",
 25: "Not a typewriter",
 26: "Text file busy",
 27: "File too large",
 28: "No space left on device",
 29: "Illegal seek",
 30: "Read only file system",
 31: "Too many links",
 32: "Broken pipe",
 33: "Math arg out of domain of func",
 34: "Math result not representable",
 35: "File locking deadlock error",
 36: "File or path name too long",
 37: "No record locks available",
 38: "Function not implemented",
 39: "Directory not empty",
 40: "Too many symbolic links",
 42: "No message of desired type",
 43: "Identifier removed",
 44: "Channel number out of range",
 45: "Level 2 not synchronized",
 46: "Level 3 halted",
 47: "Level 3 reset",
 48: "Link number out of range",
 49: "Protocol driver not attached",
 50: "No CSI structure available",
 51: "Level 2 halted",
 52: "Invalid exchange",
 53: "Invalid request descriptor",
 54: "Exchange full",
 55: "No anode",
 56: "Invalid request code",
 57: "Invalid slot",
 59: "Bad font file fmt",
 60: "Device not a stream",
 61: "No data (for no delay io)",
 62: "Timer expired",
 63: "Out of streams resources",
 64: "Machine is not on the network",
 65: "Package not installed",
 66: "The object is remote",
 67: "The link has been severed",
 68: "Advertise error",
 69: "Srmount error",
 70: "Communication error on send",
 71: "Protocol error",
 72: "Multihop attempted",
 73: "Cross mount point (not really error)",
 74: "Trying to read unreadable message",
 75: "Value too large for defined data type",
 76: "Given log. name not unique",
 77: "f.d. invalid for this operation",
 78: "Remote address changed",
 79: "Can   access a needed shared lib",
 80: "Accessing a corrupted shared lib",
 81: ".lib section in a.out corrupted",
 82: "Attempting to link in too many libs",
 83: "Attempting to exec a shared library",
 84: "Illegal byte sequence",
 86: "Streams pipe error",
 87: "Too many users",
 88: "Socket operation on non-socket",
 89: "Destination address required",
 90: "Message too long",
 91: "Protocol wrong type for socket",
 92: "Protocol not available",
 93: "Unknown protocol",
 94: "Socket type not supported",
 95: "Not supported",
 96: "Protocol family not supported",
 97: "Address family not supported by protocol family",
 98: "Address already in use",
 99: "Address not available",
 100: "Network interface is not configured",
 101: "Network is unreachable",
 102: "Connection reset by network",
 103: "Connection aborted",
 104: "Connection reset by peer",
 105: "No buffer space available",
 106: "Socket is already connected",
 107: "Socket is not connected",
 108: "Can't send after socket shutdown",
 109: "Too many references",
 110: "Connection timed out",
 111: "Connection refused",
 112: "Host is down",
 113: "Host is unreachable",
 114: "Socket already connected",
 115: "Connection already in progress",
 116: "Stale file handle",
 122: "Quota exceeded",
 123: "No medium (in tape drive)",
 125: "Operation canceled",
 130: "Previous owner died",
 131: "State not recoverable"
};

var ERRNO_CODES = {
 EPERM: 1,
 ENOENT: 2,
 ESRCH: 3,
 EINTR: 4,
 EIO: 5,
 ENXIO: 6,
 E2BIG: 7,
 ENOEXEC: 8,
 EBADF: 9,
 ECHILD: 10,
 EAGAIN: 11,
 EWOULDBLOCK: 11,
 ENOMEM: 12,
 EACCES: 13,
 EFAULT: 14,
 ENOTBLK: 15,
 EBUSY: 16,
 EEXIST: 17,
 EXDEV: 18,
 ENODEV: 19,
 ENOTDIR: 20,
 EISDIR: 21,
 EINVAL: 22,
 ENFILE: 23,
 EMFILE: 24,
 ENOTTY: 25,
 ETXTBSY: 26,
 EFBIG: 27,
 ENOSPC: 28,
 ESPIPE: 29,
 EROFS: 30,
 EMLINK: 31,
 EPIPE: 32,
 EDOM: 33,
 ERANGE: 34,
 ENOMSG: 42,
 EIDRM: 43,
 ECHRNG: 44,
 EL2NSYNC: 45,
 EL3HLT: 46,
 EL3RST: 47,
 ELNRNG: 48,
 EUNATCH: 49,
 ENOCSI: 50,
 EL2HLT: 51,
 EDEADLK: 35,
 ENOLCK: 37,
 EBADE: 52,
 EBADR: 53,
 EXFULL: 54,
 ENOANO: 55,
 EBADRQC: 56,
 EBADSLT: 57,
 EDEADLOCK: 35,
 EBFONT: 59,
 ENOSTR: 60,
 ENODATA: 61,
 ETIME: 62,
 ENOSR: 63,
 ENONET: 64,
 ENOPKG: 65,
 EREMOTE: 66,
 ENOLINK: 67,
 EADV: 68,
 ESRMNT: 69,
 ECOMM: 70,
 EPROTO: 71,
 EMULTIHOP: 72,
 EDOTDOT: 73,
 EBADMSG: 74,
 ENOTUNIQ: 76,
 EBADFD: 77,
 EREMCHG: 78,
 ELIBACC: 79,
 ELIBBAD: 80,
 ELIBSCN: 81,
 ELIBMAX: 82,
 ELIBEXEC: 83,
 ENOSYS: 38,
 ENOTEMPTY: 39,
 ENAMETOOLONG: 36,
 ELOOP: 40,
 EOPNOTSUPP: 95,
 EPFNOSUPPORT: 96,
 ECONNRESET: 104,
 ENOBUFS: 105,
 EAFNOSUPPORT: 97,
 EPROTOTYPE: 91,
 ENOTSOCK: 88,
 ENOPROTOOPT: 92,
 ESHUTDOWN: 108,
 ECONNREFUSED: 111,
 EADDRINUSE: 98,
 ECONNABORTED: 103,
 ENETUNREACH: 101,
 ENETDOWN: 100,
 ETIMEDOUT: 110,
 EHOSTDOWN: 112,
 EHOSTUNREACH: 113,
 EINPROGRESS: 115,
 EALREADY: 114,
 EDESTADDRREQ: 89,
 EMSGSIZE: 90,
 EPROTONOSUPPORT: 93,
 ESOCKTNOSUPPORT: 94,
 EADDRNOTAVAIL: 99,
 ENETRESET: 102,
 EISCONN: 106,
 ENOTCONN: 107,
 ETOOMANYREFS: 109,
 EUSERS: 87,
 EDQUOT: 122,
 ESTALE: 116,
 ENOTSUP: 95,
 ENOMEDIUM: 123,
 EILSEQ: 84,
 EOVERFLOW: 75,
 ECANCELED: 125,
 ENOTRECOVERABLE: 131,
 EOWNERDEAD: 130,
 ESTRPIPE: 86
};

var FS = {
 root: null,
 mounts: [],
 devices: {},
 streams: [],
 nextInode: 1,
 nameTable: null,
 currentPath: "/",
 initialized: false,
 ignorePermissions: true,
 trackingDelegate: {},
 tracking: {
  openFlags: {
   READ: 1,
   WRITE: 2
  }
 },
 ErrnoError: null,
 genericErrors: {},
 filesystems: null,
 syncFSRequests: 0,
 handleFSError: function(e) {
  if (!(e instanceof FS.ErrnoError)) throw e + " : " + stackTrace();
  return ___setErrNo(e.errno);
 },
 lookupPath: function(path, opts) {
  path = PATH_FS.resolve(FS.cwd(), path);
  opts = opts || {};
  if (!path) return {
   path: "",
   node: null
  };
  var defaults = {
   follow_mount: true,
   recurse_count: 0
  };
  for (var key in defaults) {
   if (opts[key] === undefined) {
    opts[key] = defaults[key];
   }
  }
  if (opts.recurse_count > 8) {
   throw new FS.ErrnoError(40);
  }
  var parts = PATH.normalizeArray(path.split("/").filter(function(p) {
   return !!p;
  }), false);
  var current = FS.root;
  var current_path = "/";
  for (var i = 0; i < parts.length; i++) {
   var islast = i === parts.length - 1;
   if (islast && opts.parent) {
    break;
   }
   current = FS.lookupNode(current, parts[i]);
   current_path = PATH.join2(current_path, parts[i]);
   if (FS.isMountpoint(current)) {
    if (!islast || islast && opts.follow_mount) {
     current = current.mounted.root;
    }
   }
   if (!islast || opts.follow) {
    var count = 0;
    while (FS.isLink(current.mode)) {
     var link = FS.readlink(current_path);
     current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
     var lookup = FS.lookupPath(current_path, {
      recurse_count: opts.recurse_count
     });
     current = lookup.node;
     if (count++ > 40) {
      throw new FS.ErrnoError(40);
     }
    }
   }
  }
  return {
   path: current_path,
   node: current
  };
 },
 getPath: function(node) {
  var path;
  while (true) {
   if (FS.isRoot(node)) {
    var mount = node.mount.mountpoint;
    if (!path) return mount;
    return mount[mount.length - 1] !== "/" ? mount + "/" + path : mount + path;
   }
   path = path ? node.name + "/" + path : node.name;
   node = node.parent;
  }
 },
 hashName: function(parentid, name) {
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
   hash = (hash << 5) - hash + name.charCodeAt(i) | 0;
  }
  return (parentid + hash >>> 0) % FS.nameTable.length;
 },
 hashAddNode: function(node) {
  var hash = FS.hashName(node.parent.id, node.name);
  node.name_next = FS.nameTable[hash];
  FS.nameTable[hash] = node;
 },
 hashRemoveNode: function(node) {
  var hash = FS.hashName(node.parent.id, node.name);
  if (FS.nameTable[hash] === node) {
   FS.nameTable[hash] = node.name_next;
  } else {
   var current = FS.nameTable[hash];
   while (current) {
    if (current.name_next === node) {
     current.name_next = node.name_next;
     break;
    }
    current = current.name_next;
   }
  }
 },
 lookupNode: function(parent, name) {
  var err = FS.mayLookup(parent);
  if (err) {
   throw new FS.ErrnoError(err, parent);
  }
  var hash = FS.hashName(parent.id, name);
  for (var node = FS.nameTable[hash]; node; node = node.name_next) {
   var nodeName = node.name;
   if (node.parent.id === parent.id && nodeName === name) {
    return node;
   }
  }
  return FS.lookup(parent, name);
 },
 createNode: function(parent, name, mode, rdev) {
  if (!FS.FSNode) {
   FS.FSNode = function(parent, name, mode, rdev) {
    if (!parent) {
     parent = this;
    }
    this.parent = parent;
    this.mount = parent.mount;
    this.mounted = null;
    this.id = FS.nextInode++;
    this.name = name;
    this.mode = mode;
    this.node_ops = {};
    this.stream_ops = {};
    this.rdev = rdev;
   };
   FS.FSNode.prototype = {};
   var readMode = 292 | 73;
   var writeMode = 146;
   Object.defineProperties(FS.FSNode.prototype, {
    read: {
     get: function() {
      return (this.mode & readMode) === readMode;
     },
     set: function(val) {
      val ? this.mode |= readMode : this.mode &= ~readMode;
     }
    },
    write: {
     get: function() {
      return (this.mode & writeMode) === writeMode;
     },
     set: function(val) {
      val ? this.mode |= writeMode : this.mode &= ~writeMode;
     }
    },
    isFolder: {
     get: function() {
      return FS.isDir(this.mode);
     }
    },
    isDevice: {
     get: function() {
      return FS.isChrdev(this.mode);
     }
    }
   });
  }
  var node = new FS.FSNode(parent, name, mode, rdev);
  FS.hashAddNode(node);
  return node;
 },
 destroyNode: function(node) {
  FS.hashRemoveNode(node);
 },
 isRoot: function(node) {
  return node === node.parent;
 },
 isMountpoint: function(node) {
  return !!node.mounted;
 },
 isFile: function(mode) {
  return (mode & 61440) === 32768;
 },
 isDir: function(mode) {
  return (mode & 61440) === 16384;
 },
 isLink: function(mode) {
  return (mode & 61440) === 40960;
 },
 isChrdev: function(mode) {
  return (mode & 61440) === 8192;
 },
 isBlkdev: function(mode) {
  return (mode & 61440) === 24576;
 },
 isFIFO: function(mode) {
  return (mode & 61440) === 4096;
 },
 isSocket: function(mode) {
  return (mode & 49152) === 49152;
 },
 flagModes: {
  "r": 0,
  "rs": 1052672,
  "r+": 2,
  "w": 577,
  "wx": 705,
  "xw": 705,
  "w+": 578,
  "wx+": 706,
  "xw+": 706,
  "a": 1089,
  "ax": 1217,
  "xa": 1217,
  "a+": 1090,
  "ax+": 1218,
  "xa+": 1218
 },
 modeStringToFlags: function(str) {
  var flags = FS.flagModes[str];
  if (typeof flags === "undefined") {
   throw new Error("Unknown file open mode: " + str);
  }
  return flags;
 },
 flagsToPermissionString: function(flag) {
  var perms = [ "r", "w", "rw" ][flag & 3];
  if (flag & 512) {
   perms += "w";
  }
  return perms;
 },
 nodePermissions: function(node, perms) {
  if (FS.ignorePermissions) {
   return 0;
  }
  if (perms.indexOf("r") !== -1 && !(node.mode & 292)) {
   return 13;
  } else if (perms.indexOf("w") !== -1 && !(node.mode & 146)) {
   return 13;
  } else if (perms.indexOf("x") !== -1 && !(node.mode & 73)) {
   return 13;
  }
  return 0;
 },
 mayLookup: function(dir) {
  var err = FS.nodePermissions(dir, "x");
  if (err) return err;
  if (!dir.node_ops.lookup) return 13;
  return 0;
 },
 mayCreate: function(dir, name) {
  try {
   var node = FS.lookupNode(dir, name);
   return 17;
  } catch (e) {}
  return FS.nodePermissions(dir, "wx");
 },
 mayDelete: function(dir, name, isdir) {
  var node;
  try {
   node = FS.lookupNode(dir, name);
  } catch (e) {
   return e.errno;
  }
  var err = FS.nodePermissions(dir, "wx");
  if (err) {
   return err;
  }
  if (isdir) {
   if (!FS.isDir(node.mode)) {
    return 20;
   }
   if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
    return 16;
   }
  } else {
   if (FS.isDir(node.mode)) {
    return 21;
   }
  }
  return 0;
 },
 mayOpen: function(node, flags) {
  if (!node) {
   return 2;
  }
  if (FS.isLink(node.mode)) {
   return 40;
  } else if (FS.isDir(node.mode)) {
   if (FS.flagsToPermissionString(flags) !== "r" || flags & 512) {
    return 21;
   }
  }
  return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
 },
 MAX_OPEN_FDS: 4096,
 nextfd: function(fd_start, fd_end) {
  fd_start = fd_start || 0;
  fd_end = fd_end || FS.MAX_OPEN_FDS;
  for (var fd = fd_start; fd <= fd_end; fd++) {
   if (!FS.streams[fd]) {
    return fd;
   }
  }
  throw new FS.ErrnoError(24);
 },
 getStream: function(fd) {
  return FS.streams[fd];
 },
 createStream: function(stream, fd_start, fd_end) {
  if (!FS.FSStream) {
   FS.FSStream = function() {};
   FS.FSStream.prototype = {};
   Object.defineProperties(FS.FSStream.prototype, {
    object: {
     get: function() {
      return this.node;
     },
     set: function(val) {
      this.node = val;
     }
    },
    isRead: {
     get: function() {
      return (this.flags & 2097155) !== 1;
     }
    },
    isWrite: {
     get: function() {
      return (this.flags & 2097155) !== 0;
     }
    },
    isAppend: {
     get: function() {
      return this.flags & 1024;
     }
    }
   });
  }
  var newStream = new FS.FSStream();
  for (var p in stream) {
   newStream[p] = stream[p];
  }
  stream = newStream;
  var fd = FS.nextfd(fd_start, fd_end);
  stream.fd = fd;
  FS.streams[fd] = stream;
  return stream;
 },
 closeStream: function(fd) {
  FS.streams[fd] = null;
 },
 chrdev_stream_ops: {
  open: function(stream) {
   var device = FS.getDevice(stream.node.rdev);
   stream.stream_ops = device.stream_ops;
   if (stream.stream_ops.open) {
    stream.stream_ops.open(stream);
   }
  },
  llseek: function() {
   throw new FS.ErrnoError(29);
  }
 },
 major: function(dev) {
  return dev >> 8;
 },
 minor: function(dev) {
  return dev & 255;
 },
 makedev: function(ma, mi) {
  return ma << 8 | mi;
 },
 registerDevice: function(dev, ops) {
  FS.devices[dev] = {
   stream_ops: ops
  };
 },
 getDevice: function(dev) {
  return FS.devices[dev];
 },
 getMounts: function(mount) {
  var mounts = [];
  var check = [ mount ];
  while (check.length) {
   var m = check.pop();
   mounts.push(m);
   check.push.apply(check, m.mounts);
  }
  return mounts;
 },
 syncfs: function(populate, callback) {
  if (typeof populate === "function") {
   callback = populate;
   populate = false;
  }
  FS.syncFSRequests++;
  if (FS.syncFSRequests > 1) {
   console.log("warning: " + FS.syncFSRequests + " FS.syncfs operations in flight at once, probably just doing extra work");
  }
  var mounts = FS.getMounts(FS.root.mount);
  var completed = 0;
  function doCallback(err) {
   assert(FS.syncFSRequests > 0);
   FS.syncFSRequests--;
   return callback(err);
  }
  function done(err) {
   if (err) {
    if (!done.errored) {
     done.errored = true;
     return doCallback(err);
    }
    return;
   }
   if (++completed >= mounts.length) {
    doCallback(null);
   }
  }
  mounts.forEach(function(mount) {
   if (!mount.type.syncfs) {
    return done(null);
   }
   mount.type.syncfs(mount, populate, done);
  });
 },
 mount: function(type, opts, mountpoint) {
  var root = mountpoint === "/";
  var pseudo = !mountpoint;
  var node;
  if (root && FS.root) {
   throw new FS.ErrnoError(16);
  } else if (!root && !pseudo) {
   var lookup = FS.lookupPath(mountpoint, {
    follow_mount: false
   });
   mountpoint = lookup.path;
   node = lookup.node;
   if (FS.isMountpoint(node)) {
    throw new FS.ErrnoError(16);
   }
   if (!FS.isDir(node.mode)) {
    throw new FS.ErrnoError(20);
   }
  }
  var mount = {
   type: type,
   opts: opts,
   mountpoint: mountpoint,
   mounts: []
  };
  var mountRoot = type.mount(mount);
  mountRoot.mount = mount;
  mount.root = mountRoot;
  if (root) {
   FS.root = mountRoot;
  } else if (node) {
   node.mounted = mount;
   if (node.mount) {
    node.mount.mounts.push(mount);
   }
  }
  return mountRoot;
 },
 unmount: function(mountpoint) {
  var lookup = FS.lookupPath(mountpoint, {
   follow_mount: false
  });
  if (!FS.isMountpoint(lookup.node)) {
   throw new FS.ErrnoError(22);
  }
  var node = lookup.node;
  var mount = node.mounted;
  var mounts = FS.getMounts(mount);
  Object.keys(FS.nameTable).forEach(function(hash) {
   var current = FS.nameTable[hash];
   while (current) {
    var next = current.name_next;
    if (mounts.indexOf(current.mount) !== -1) {
     FS.destroyNode(current);
    }
    current = next;
   }
  });
  node.mounted = null;
  var idx = node.mount.mounts.indexOf(mount);
  assert(idx !== -1);
  node.mount.mounts.splice(idx, 1);
 },
 lookup: function(parent, name) {
  return parent.node_ops.lookup(parent, name);
 },
 mknod: function(path, mode, dev) {
  var lookup = FS.lookupPath(path, {
   parent: true
  });
  var parent = lookup.node;
  var name = PATH.basename(path);
  if (!name || name === "." || name === "..") {
   throw new FS.ErrnoError(22);
  }
  var err = FS.mayCreate(parent, name);
  if (err) {
   throw new FS.ErrnoError(err);
  }
  if (!parent.node_ops.mknod) {
   throw new FS.ErrnoError(1);
  }
  return parent.node_ops.mknod(parent, name, mode, dev);
 },
 create: function(path, mode) {
  mode = mode !== undefined ? mode : 438;
  mode &= 4095;
  mode |= 32768;
  return FS.mknod(path, mode, 0);
 },
 mkdir: function(path, mode) {
  mode = mode !== undefined ? mode : 511;
  mode &= 511 | 512;
  mode |= 16384;
  return FS.mknod(path, mode, 0);
 },
 mkdirTree: function(path, mode) {
  var dirs = path.split("/");
  var d = "";
  for (var i = 0; i < dirs.length; ++i) {
   if (!dirs[i]) continue;
   d += "/" + dirs[i];
   try {
    FS.mkdir(d, mode);
   } catch (e) {
    if (e.errno != 17) throw e;
   }
  }
 },
 mkdev: function(path, mode, dev) {
  if (typeof dev === "undefined") {
   dev = mode;
   mode = 438;
  }
  mode |= 8192;
  return FS.mknod(path, mode, dev);
 },
 symlink: function(oldpath, newpath) {
  if (!PATH_FS.resolve(oldpath)) {
   throw new FS.ErrnoError(2);
  }
  var lookup = FS.lookupPath(newpath, {
   parent: true
  });
  var parent = lookup.node;
  if (!parent) {
   throw new FS.ErrnoError(2);
  }
  var newname = PATH.basename(newpath);
  var err = FS.mayCreate(parent, newname);
  if (err) {
   throw new FS.ErrnoError(err);
  }
  if (!parent.node_ops.symlink) {
   throw new FS.ErrnoError(1);
  }
  return parent.node_ops.symlink(parent, newname, oldpath);
 },
 rename: function(old_path, new_path) {
  var old_dirname = PATH.dirname(old_path);
  var new_dirname = PATH.dirname(new_path);
  var old_name = PATH.basename(old_path);
  var new_name = PATH.basename(new_path);
  var lookup, old_dir, new_dir;
  try {
   lookup = FS.lookupPath(old_path, {
    parent: true
   });
   old_dir = lookup.node;
   lookup = FS.lookupPath(new_path, {
    parent: true
   });
   new_dir = lookup.node;
  } catch (e) {
   throw new FS.ErrnoError(16);
  }
  if (!old_dir || !new_dir) throw new FS.ErrnoError(2);
  if (old_dir.mount !== new_dir.mount) {
   throw new FS.ErrnoError(18);
  }
  var old_node = FS.lookupNode(old_dir, old_name);
  var relative = PATH_FS.relative(old_path, new_dirname);
  if (relative.charAt(0) !== ".") {
   throw new FS.ErrnoError(22);
  }
  relative = PATH_FS.relative(new_path, old_dirname);
  if (relative.charAt(0) !== ".") {
   throw new FS.ErrnoError(39);
  }
  var new_node;
  try {
   new_node = FS.lookupNode(new_dir, new_name);
  } catch (e) {}
  if (old_node === new_node) {
   return;
  }
  var isdir = FS.isDir(old_node.mode);
  var err = FS.mayDelete(old_dir, old_name, isdir);
  if (err) {
   throw new FS.ErrnoError(err);
  }
  err = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
  if (err) {
   throw new FS.ErrnoError(err);
  }
  if (!old_dir.node_ops.rename) {
   throw new FS.ErrnoError(1);
  }
  if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
   throw new FS.ErrnoError(16);
  }
  if (new_dir !== old_dir) {
   err = FS.nodePermissions(old_dir, "w");
   if (err) {
    throw new FS.ErrnoError(err);
   }
  }
  try {
   if (FS.trackingDelegate["willMovePath"]) {
    FS.trackingDelegate["willMovePath"](old_path, new_path);
   }
  } catch (e) {
   console.log("FS.trackingDelegate['willMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message);
  }
  FS.hashRemoveNode(old_node);
  try {
   old_dir.node_ops.rename(old_node, new_dir, new_name);
  } catch (e) {
   throw e;
  } finally {
   FS.hashAddNode(old_node);
  }
  try {
   if (FS.trackingDelegate["onMovePath"]) FS.trackingDelegate["onMovePath"](old_path, new_path);
  } catch (e) {
   console.log("FS.trackingDelegate['onMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message);
  }
 },
 rmdir: function(path) {
  var lookup = FS.lookupPath(path, {
   parent: true
  });
  var parent = lookup.node;
  var name = PATH.basename(path);
  var node = FS.lookupNode(parent, name);
  var err = FS.mayDelete(parent, name, true);
  if (err) {
   throw new FS.ErrnoError(err);
  }
  if (!parent.node_ops.rmdir) {
   throw new FS.ErrnoError(1);
  }
  if (FS.isMountpoint(node)) {
   throw new FS.ErrnoError(16);
  }
  try {
   if (FS.trackingDelegate["willDeletePath"]) {
    FS.trackingDelegate["willDeletePath"](path);
   }
  } catch (e) {
   console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message);
  }
  parent.node_ops.rmdir(parent, name);
  FS.destroyNode(node);
  try {
   if (FS.trackingDelegate["onDeletePath"]) FS.trackingDelegate["onDeletePath"](path);
  } catch (e) {
   console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message);
  }
 },
 readdir: function(path) {
  var lookup = FS.lookupPath(path, {
   follow: true
  });
  var node = lookup.node;
  if (!node.node_ops.readdir) {
   throw new FS.ErrnoError(20);
  }
  return node.node_ops.readdir(node);
 },
 unlink: function(path) {
  var lookup = FS.lookupPath(path, {
   parent: true
  });
  var parent = lookup.node;
  var name = PATH.basename(path);
  var node = FS.lookupNode(parent, name);
  var err = FS.mayDelete(parent, name, false);
  if (err) {
   throw new FS.ErrnoError(err);
  }
  if (!parent.node_ops.unlink) {
   throw new FS.ErrnoError(1);
  }
  if (FS.isMountpoint(node)) {
   throw new FS.ErrnoError(16);
  }
  try {
   if (FS.trackingDelegate["willDeletePath"]) {
    FS.trackingDelegate["willDeletePath"](path);
   }
  } catch (e) {
   console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message);
  }
  parent.node_ops.unlink(parent, name);
  FS.destroyNode(node);
  try {
   if (FS.trackingDelegate["onDeletePath"]) FS.trackingDelegate["onDeletePath"](path);
  } catch (e) {
   console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message);
  }
 },
 readlink: function(path) {
  var lookup = FS.lookupPath(path);
  var link = lookup.node;
  if (!link) {
   throw new FS.ErrnoError(2);
  }
  if (!link.node_ops.readlink) {
   throw new FS.ErrnoError(22);
  }
  return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
 },
 stat: function(path, dontFollow) {
  var lookup = FS.lookupPath(path, {
   follow: !dontFollow
  });
  var node = lookup.node;
  if (!node) {
   throw new FS.ErrnoError(2);
  }
  if (!node.node_ops.getattr) {
   throw new FS.ErrnoError(1);
  }
  return node.node_ops.getattr(node);
 },
 lstat: function(path) {
  return FS.stat(path, true);
 },
 chmod: function(path, mode, dontFollow) {
  var node;
  if (typeof path === "string") {
   var lookup = FS.lookupPath(path, {
    follow: !dontFollow
   });
   node = lookup.node;
  } else {
   node = path;
  }
  if (!node.node_ops.setattr) {
   throw new FS.ErrnoError(1);
  }
  node.node_ops.setattr(node, {
   mode: mode & 4095 | node.mode & ~4095,
   timestamp: Date.now()
  });
 },
 lchmod: function(path, mode) {
  FS.chmod(path, mode, true);
 },
 fchmod: function(fd, mode) {
  var stream = FS.getStream(fd);
  if (!stream) {
   throw new FS.ErrnoError(9);
  }
  FS.chmod(stream.node, mode);
 },
 chown: function(path, uid, gid, dontFollow) {
  var node;
  if (typeof path === "string") {
   var lookup = FS.lookupPath(path, {
    follow: !dontFollow
   });
   node = lookup.node;
  } else {
   node = path;
  }
  if (!node.node_ops.setattr) {
   throw new FS.ErrnoError(1);
  }
  node.node_ops.setattr(node, {
   timestamp: Date.now()
  });
 },
 lchown: function(path, uid, gid) {
  FS.chown(path, uid, gid, true);
 },
 fchown: function(fd, uid, gid) {
  var stream = FS.getStream(fd);
  if (!stream) {
   throw new FS.ErrnoError(9);
  }
  FS.chown(stream.node, uid, gid);
 },
 truncate: function(path, len) {
  if (len < 0) {
   throw new FS.ErrnoError(22);
  }
  var node;
  if (typeof path === "string") {
   var lookup = FS.lookupPath(path, {
    follow: true
   });
   node = lookup.node;
  } else {
   node = path;
  }
  if (!node.node_ops.setattr) {
   throw new FS.ErrnoError(1);
  }
  if (FS.isDir(node.mode)) {
   throw new FS.ErrnoError(21);
  }
  if (!FS.isFile(node.mode)) {
   throw new FS.ErrnoError(22);
  }
  var err = FS.nodePermissions(node, "w");
  if (err) {
   throw new FS.ErrnoError(err);
  }
  node.node_ops.setattr(node, {
   size: len,
   timestamp: Date.now()
  });
 },
 ftruncate: function(fd, len) {
  var stream = FS.getStream(fd);
  if (!stream) {
   throw new FS.ErrnoError(9);
  }
  if ((stream.flags & 2097155) === 0) {
   throw new FS.ErrnoError(22);
  }
  FS.truncate(stream.node, len);
 },
 utime: function(path, atime, mtime) {
  var lookup = FS.lookupPath(path, {
   follow: true
  });
  var node = lookup.node;
  node.node_ops.setattr(node, {
   timestamp: Math.max(atime, mtime)
  });
 },
 open: function(path, flags, mode, fd_start, fd_end) {
  if (path === "") {
   throw new FS.ErrnoError(2);
  }
  flags = typeof flags === "string" ? FS.modeStringToFlags(flags) : flags;
  mode = typeof mode === "undefined" ? 438 : mode;
  if (flags & 64) {
   mode = mode & 4095 | 32768;
  } else {
   mode = 0;
  }
  var node;
  if (typeof path === "object") {
   node = path;
  } else {
   path = PATH.normalize(path);
   try {
    var lookup = FS.lookupPath(path, {
     follow: !(flags & 131072)
    });
    node = lookup.node;
   } catch (e) {}
  }
  var created = false;
  if (flags & 64) {
   if (node) {
    if (flags & 128) {
     throw new FS.ErrnoError(17);
    }
   } else {
    node = FS.mknod(path, mode, 0);
    created = true;
   }
  }
  if (!node) {
   throw new FS.ErrnoError(2);
  }
  if (FS.isChrdev(node.mode)) {
   flags &= ~512;
  }
  if (flags & 65536 && !FS.isDir(node.mode)) {
   throw new FS.ErrnoError(20);
  }
  if (!created) {
   var err = FS.mayOpen(node, flags);
   if (err) {
    throw new FS.ErrnoError(err);
   }
  }
  if (flags & 512) {
   FS.truncate(node, 0);
  }
  flags &= ~(128 | 512);
  var stream = FS.createStream({
   node: node,
   path: FS.getPath(node),
   flags: flags,
   seekable: true,
   position: 0,
   stream_ops: node.stream_ops,
   ungotten: [],
   error: false
  }, fd_start, fd_end);
  if (stream.stream_ops.open) {
   stream.stream_ops.open(stream);
  }
  if (Module["logReadFiles"] && !(flags & 1)) {
   if (!FS.readFiles) FS.readFiles = {};
   if (!(path in FS.readFiles)) {
    FS.readFiles[path] = 1;
    console.log("FS.trackingDelegate error on read file: " + path);
   }
  }
  try {
   if (FS.trackingDelegate["onOpenFile"]) {
    var trackingFlags = 0;
    if ((flags & 2097155) !== 1) {
     trackingFlags |= FS.tracking.openFlags.READ;
    }
    if ((flags & 2097155) !== 0) {
     trackingFlags |= FS.tracking.openFlags.WRITE;
    }
    FS.trackingDelegate["onOpenFile"](path, trackingFlags);
   }
  } catch (e) {
   console.log("FS.trackingDelegate['onOpenFile']('" + path + "', flags) threw an exception: " + e.message);
  }
  return stream;
 },
 close: function(stream) {
  if (FS.isClosed(stream)) {
   throw new FS.ErrnoError(9);
  }
  if (stream.getdents) stream.getdents = null;
  try {
   if (stream.stream_ops.close) {
    stream.stream_ops.close(stream);
   }
  } catch (e) {
   throw e;
  } finally {
   FS.closeStream(stream.fd);
  }
  stream.fd = null;
 },
 isClosed: function(stream) {
  return stream.fd === null;
 },
 llseek: function(stream, offset, whence) {
  if (FS.isClosed(stream)) {
   throw new FS.ErrnoError(9);
  }
  if (!stream.seekable || !stream.stream_ops.llseek) {
   throw new FS.ErrnoError(29);
  }
  if (whence != 0 && whence != 1 && whence != 2) {
   throw new FS.ErrnoError(22);
  }
  stream.position = stream.stream_ops.llseek(stream, offset, whence);
  stream.ungotten = [];
  return stream.position;
 },
 read: function(stream, buffer, offset, length, position) {
  if (length < 0 || position < 0) {
   throw new FS.ErrnoError(22);
  }
  if (FS.isClosed(stream)) {
   throw new FS.ErrnoError(9);
  }
  if ((stream.flags & 2097155) === 1) {
   throw new FS.ErrnoError(9);
  }
  if (FS.isDir(stream.node.mode)) {
   throw new FS.ErrnoError(21);
  }
  if (!stream.stream_ops.read) {
   throw new FS.ErrnoError(22);
  }
  var seeking = typeof position !== "undefined";
  if (!seeking) {
   position = stream.position;
  } else if (!stream.seekable) {
   throw new FS.ErrnoError(29);
  }
  var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
  if (!seeking) stream.position += bytesRead;
  return bytesRead;
 },
 write: function(stream, buffer, offset, length, position, canOwn) {
  if (length < 0 || position < 0) {
   throw new FS.ErrnoError(22);
  }
  if (FS.isClosed(stream)) {
   throw new FS.ErrnoError(9);
  }
  if ((stream.flags & 2097155) === 0) {
   throw new FS.ErrnoError(9);
  }
  if (FS.isDir(stream.node.mode)) {
   throw new FS.ErrnoError(21);
  }
  if (!stream.stream_ops.write) {
   throw new FS.ErrnoError(22);
  }
  if (stream.flags & 1024) {
   FS.llseek(stream, 0, 2);
  }
  var seeking = typeof position !== "undefined";
  if (!seeking) {
   position = stream.position;
  } else if (!stream.seekable) {
   throw new FS.ErrnoError(29);
  }
  var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
  if (!seeking) stream.position += bytesWritten;
  try {
   if (stream.path && FS.trackingDelegate["onWriteToFile"]) FS.trackingDelegate["onWriteToFile"](stream.path);
  } catch (e) {
   console.log("FS.trackingDelegate['onWriteToFile']('" + stream.path + "') threw an exception: " + e.message);
  }
  return bytesWritten;
 },
 allocate: function(stream, offset, length) {
  if (FS.isClosed(stream)) {
   throw new FS.ErrnoError(9);
  }
  if (offset < 0 || length <= 0) {
   throw new FS.ErrnoError(22);
  }
  if ((stream.flags & 2097155) === 0) {
   throw new FS.ErrnoError(9);
  }
  if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
   throw new FS.ErrnoError(19);
  }
  if (!stream.stream_ops.allocate) {
   throw new FS.ErrnoError(95);
  }
  stream.stream_ops.allocate(stream, offset, length);
 },
 mmap: function(stream, buffer, offset, length, position, prot, flags) {
  if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
   throw new FS.ErrnoError(13);
  }
  if ((stream.flags & 2097155) === 1) {
   throw new FS.ErrnoError(13);
  }
  if (!stream.stream_ops.mmap) {
   throw new FS.ErrnoError(19);
  }
  return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
 },
 msync: function(stream, buffer, offset, length, mmapFlags) {
  if (!stream || !stream.stream_ops.msync) {
   return 0;
  }
  return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
 },
 munmap: function(stream) {
  return 0;
 },
 ioctl: function(stream, cmd, arg) {
  if (!stream.stream_ops.ioctl) {
   throw new FS.ErrnoError(25);
  }
  return stream.stream_ops.ioctl(stream, cmd, arg);
 },
 readFile: function(path, opts) {
  opts = opts || {};
  opts.flags = opts.flags || "r";
  opts.encoding = opts.encoding || "binary";
  if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
   throw new Error('Invalid encoding type "' + opts.encoding + '"');
  }
  var ret;
  var stream = FS.open(path, opts.flags);
  var stat = FS.stat(path);
  var length = stat.size;
  var buf = new Uint8Array(length);
  FS.read(stream, buf, 0, length, 0);
  if (opts.encoding === "utf8") {
   ret = UTF8ArrayToString(buf, 0);
  } else if (opts.encoding === "binary") {
   ret = buf;
  }
  FS.close(stream);
  return ret;
 },
 writeFile: function(path, data, opts) {
  opts = opts || {};
  opts.flags = opts.flags || "w";
  var stream = FS.open(path, opts.flags, opts.mode);
  if (typeof data === "string") {
   var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
   var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
   FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
  } else if (ArrayBuffer.isView(data)) {
   FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
  } else {
   throw new Error("Unsupported data type");
  }
  FS.close(stream);
 },
 cwd: function() {
  return FS.currentPath;
 },
 chdir: function(path) {
  var lookup = FS.lookupPath(path, {
   follow: true
  });
  if (lookup.node === null) {
   throw new FS.ErrnoError(2);
  }
  if (!FS.isDir(lookup.node.mode)) {
   throw new FS.ErrnoError(20);
  }
  var err = FS.nodePermissions(lookup.node, "x");
  if (err) {
   throw new FS.ErrnoError(err);
  }
  FS.currentPath = lookup.path;
 },
 createDefaultDirectories: function() {
  FS.mkdir("/tmp");
  FS.mkdir("/home");
  FS.mkdir("/home/web_user");
 },
 createDefaultDevices: function() {
  FS.mkdir("/dev");
  FS.registerDevice(FS.makedev(1, 3), {
   read: function() {
    return 0;
   },
   write: function(stream, buffer, offset, length, pos) {
    return length;
   }
  });
  FS.mkdev("/dev/null", FS.makedev(1, 3));
  TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
  TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
  FS.mkdev("/dev/tty", FS.makedev(5, 0));
  FS.mkdev("/dev/tty1", FS.makedev(6, 0));
  var random_device;
  if (typeof crypto === "object" && typeof crypto["getRandomValues"] === "function") {
   var randomBuffer = new Uint8Array(1);
   random_device = function() {
    crypto.getRandomValues(randomBuffer);
    return randomBuffer[0];
   };
  } else if (ENVIRONMENT_IS_NODE) {
   try {
    var crypto_module = require("crypto");
    random_device = function() {
     return crypto_module["randomBytes"](1)[0];
    };
   } catch (e) {}
  } else {}
  if (!random_device) {
   random_device = function() {
    abort("no cryptographic support found for random_device. consider polyfilling it if you want to use something insecure like Math.random(), e.g. put this in a --pre-js: var crypto = { getRandomValues: function(array) { for (var i = 0; i < array.length; i++) array[i] = (Math.random()*256)|0 } };");
   };
  }
  FS.createDevice("/dev", "random", random_device);
  FS.createDevice("/dev", "urandom", random_device);
  FS.mkdir("/dev/shm");
  FS.mkdir("/dev/shm/tmp");
 },
 createSpecialDirectories: function() {
  FS.mkdir("/proc");
  FS.mkdir("/proc/self");
  FS.mkdir("/proc/self/fd");
  FS.mount({
   mount: function() {
    var node = FS.createNode("/proc/self", "fd", 16384 | 511, 73);
    node.node_ops = {
     lookup: function(parent, name) {
      var fd = +name;
      var stream = FS.getStream(fd);
      if (!stream) throw new FS.ErrnoError(9);
      var ret = {
       parent: null,
       mount: {
        mountpoint: "fake"
       },
       node_ops: {
        readlink: function() {
         return stream.path;
        }
       }
      };
      ret.parent = ret;
      return ret;
     }
    };
    return node;
   }
  }, {}, "/proc/self/fd");
 },
 createStandardStreams: function() {
  if (Module["stdin"]) {
   FS.createDevice("/dev", "stdin", Module["stdin"]);
  } else {
   FS.symlink("/dev/tty", "/dev/stdin");
  }
  if (Module["stdout"]) {
   FS.createDevice("/dev", "stdout", null, Module["stdout"]);
  } else {
   FS.symlink("/dev/tty", "/dev/stdout");
  }
  if (Module["stderr"]) {
   FS.createDevice("/dev", "stderr", null, Module["stderr"]);
  } else {
   FS.symlink("/dev/tty1", "/dev/stderr");
  }
  var stdin = FS.open("/dev/stdin", "r");
  var stdout = FS.open("/dev/stdout", "w");
  var stderr = FS.open("/dev/stderr", "w");
  assert(stdin.fd === 0, "invalid handle for stdin (" + stdin.fd + ")");
  assert(stdout.fd === 1, "invalid handle for stdout (" + stdout.fd + ")");
  assert(stderr.fd === 2, "invalid handle for stderr (" + stderr.fd + ")");
 },
 ensureErrnoError: function() {
  if (FS.ErrnoError) return;
  FS.ErrnoError = function ErrnoError(errno, node) {
   this.node = node;
   this.setErrno = function(errno) {
    this.errno = errno;
    for (var key in ERRNO_CODES) {
     if (ERRNO_CODES[key] === errno) {
      this.code = key;
      break;
     }
    }
   };
   this.setErrno(errno);
   this.message = ERRNO_MESSAGES[errno];
   if (this.stack) Object.defineProperty(this, "stack", {
    value: new Error().stack,
    writable: true
   });
   if (this.stack) this.stack = demangleAll(this.stack);
  };
  FS.ErrnoError.prototype = new Error();
  FS.ErrnoError.prototype.constructor = FS.ErrnoError;
  [ 2 ].forEach(function(code) {
   FS.genericErrors[code] = new FS.ErrnoError(code);
   FS.genericErrors[code].stack = "<generic error, no stack>";
  });
 },
 staticInit: function() {
  FS.ensureErrnoError();
  FS.nameTable = new Array(4096);
  FS.mount(MEMFS, {}, "/");
  FS.createDefaultDirectories();
  FS.createDefaultDevices();
  FS.createSpecialDirectories();
  FS.filesystems = {
   "MEMFS": MEMFS,
   "IDBFS": IDBFS,
   "NODEFS": NODEFS,
   "WORKERFS": WORKERFS
  };
 },
 init: function(input, output, error) {
  assert(!FS.init.initialized, "FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)");
  FS.init.initialized = true;
  FS.ensureErrnoError();
  Module["stdin"] = input || Module["stdin"];
  Module["stdout"] = output || Module["stdout"];
  Module["stderr"] = error || Module["stderr"];
  FS.createStandardStreams();
 },
 quit: function() {
  FS.init.initialized = false;
  var fflush = Module["_fflush"];
  if (fflush) fflush(0);
  for (var i = 0; i < FS.streams.length; i++) {
   var stream = FS.streams[i];
   if (!stream) {
    continue;
   }
   FS.close(stream);
  }
 },
 getMode: function(canRead, canWrite) {
  var mode = 0;
  if (canRead) mode |= 292 | 73;
  if (canWrite) mode |= 146;
  return mode;
 },
 joinPath: function(parts, forceRelative) {
  var path = PATH.join.apply(null, parts);
  if (forceRelative && path[0] == "/") path = path.substr(1);
  return path;
 },
 absolutePath: function(relative, base) {
  return PATH_FS.resolve(base, relative);
 },
 standardizePath: function(path) {
  return PATH.normalize(path);
 },
 findObject: function(path, dontResolveLastLink) {
  var ret = FS.analyzePath(path, dontResolveLastLink);
  if (ret.exists) {
   return ret.object;
  } else {
   ___setErrNo(ret.error);
   return null;
  }
 },
 analyzePath: function(path, dontResolveLastLink) {
  try {
   var lookup = FS.lookupPath(path, {
    follow: !dontResolveLastLink
   });
   path = lookup.path;
  } catch (e) {}
  var ret = {
   isRoot: false,
   exists: false,
   error: 0,
   name: null,
   path: null,
   object: null,
   parentExists: false,
   parentPath: null,
   parentObject: null
  };
  try {
   var lookup = FS.lookupPath(path, {
    parent: true
   });
   ret.parentExists = true;
   ret.parentPath = lookup.path;
   ret.parentObject = lookup.node;
   ret.name = PATH.basename(path);
   lookup = FS.lookupPath(path, {
    follow: !dontResolveLastLink
   });
   ret.exists = true;
   ret.path = lookup.path;
   ret.object = lookup.node;
   ret.name = lookup.node.name;
   ret.isRoot = lookup.path === "/";
  } catch (e) {
   ret.error = e.errno;
  }
  return ret;
 },
 createFolder: function(parent, name, canRead, canWrite) {
  var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
  var mode = FS.getMode(canRead, canWrite);
  return FS.mkdir(path, mode);
 },
 createPath: function(parent, path, canRead, canWrite) {
  parent = typeof parent === "string" ? parent : FS.getPath(parent);
  var parts = path.split("/").reverse();
  while (parts.length) {
   var part = parts.pop();
   if (!part) continue;
   var current = PATH.join2(parent, part);
   try {
    FS.mkdir(current);
   } catch (e) {}
   parent = current;
  }
  return current;
 },
 createFile: function(parent, name, properties, canRead, canWrite) {
  var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
  var mode = FS.getMode(canRead, canWrite);
  return FS.create(path, mode);
 },
 createDataFile: function(parent, name, data, canRead, canWrite, canOwn) {
  var path = name ? PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name) : parent;
  var mode = FS.getMode(canRead, canWrite);
  var node = FS.create(path, mode);
  if (data) {
   if (typeof data === "string") {
    var arr = new Array(data.length);
    for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
    data = arr;
   }
   FS.chmod(node, mode | 146);
   var stream = FS.open(node, "w");
   FS.write(stream, data, 0, data.length, 0, canOwn);
   FS.close(stream);
   FS.chmod(node, mode);
  }
  return node;
 },
 createDevice: function(parent, name, input, output) {
  var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
  var mode = FS.getMode(!!input, !!output);
  if (!FS.createDevice.major) FS.createDevice.major = 64;
  var dev = FS.makedev(FS.createDevice.major++, 0);
  FS.registerDevice(dev, {
   open: function(stream) {
    stream.seekable = false;
   },
   close: function(stream) {
    if (output && output.buffer && output.buffer.length) {
     output(10);
    }
   },
   read: function(stream, buffer, offset, length, pos) {
    var bytesRead = 0;
    for (var i = 0; i < length; i++) {
     var result;
     try {
      result = input();
     } catch (e) {
      throw new FS.ErrnoError(5);
     }
     if (result === undefined && bytesRead === 0) {
      throw new FS.ErrnoError(11);
     }
     if (result === null || result === undefined) break;
     bytesRead++;
     buffer[offset + i] = result;
    }
    if (bytesRead) {
     stream.node.timestamp = Date.now();
    }
    return bytesRead;
   },
   write: function(stream, buffer, offset, length, pos) {
    for (var i = 0; i < length; i++) {
     try {
      output(buffer[offset + i]);
     } catch (e) {
      throw new FS.ErrnoError(5);
     }
    }
    if (length) {
     stream.node.timestamp = Date.now();
    }
    return i;
   }
  });
  return FS.mkdev(path, mode, dev);
 },
 createLink: function(parent, name, target, canRead, canWrite) {
  var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
  return FS.symlink(target, path);
 },
 forceLoadFile: function(obj) {
  if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
  var success = true;
  if (typeof XMLHttpRequest !== "undefined") {
   throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
  } else if (read_) {
   try {
    obj.contents = intArrayFromString(read_(obj.url), true);
    obj.usedBytes = obj.contents.length;
   } catch (e) {
    success = false;
   }
  } else {
   throw new Error("Cannot load without read() or XMLHttpRequest.");
  }
  if (!success) ___setErrNo(5);
  return success;
 },
 createLazyFile: function(parent, name, url, canRead, canWrite) {
  function LazyUint8Array() {
   this.lengthKnown = false;
   this.chunks = [];
  }
  LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
   if (idx > this.length - 1 || idx < 0) {
    return undefined;
   }
   var chunkOffset = idx % this.chunkSize;
   var chunkNum = idx / this.chunkSize | 0;
   return this.getter(chunkNum)[chunkOffset];
  };
  LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
   this.getter = getter;
  };
  LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
   var xhr = new XMLHttpRequest();
   xhr.open("HEAD", url, false);
   xhr.send(null);
   if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
   var datalength = Number(xhr.getResponseHeader("Content-length"));
   var header;
   var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
   var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
   var chunkSize = 1024 * 1024;
   if (!hasByteServing) chunkSize = datalength;
   var doXHR = function(from, to) {
    if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
    if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
    if (typeof Uint8Array != "undefined") xhr.responseType = "arraybuffer";
    if (xhr.overrideMimeType) {
     xhr.overrideMimeType("text/plain; charset=x-user-defined");
    }
    xhr.send(null);
    if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
    if (xhr.response !== undefined) {
     return new Uint8Array(xhr.response || []);
    } else {
     return intArrayFromString(xhr.responseText || "", true);
    }
   };
   var lazyArray = this;
   lazyArray.setDataGetter(function(chunkNum) {
    var start = chunkNum * chunkSize;
    var end = (chunkNum + 1) * chunkSize - 1;
    end = Math.min(end, datalength - 1);
    if (typeof lazyArray.chunks[chunkNum] === "undefined") {
     lazyArray.chunks[chunkNum] = doXHR(start, end);
    }
    if (typeof lazyArray.chunks[chunkNum] === "undefined") throw new Error("doXHR failed!");
    return lazyArray.chunks[chunkNum];
   });
   if (usesGzip || !datalength) {
    chunkSize = datalength = 1;
    datalength = this.getter(0).length;
    chunkSize = datalength;
    console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
   }
   this._length = datalength;
   this._chunkSize = chunkSize;
   this.lengthKnown = true;
  };
  if (typeof XMLHttpRequest !== "undefined") {
   if (!ENVIRONMENT_IS_WORKER) throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
   var lazyArray = new LazyUint8Array();
   Object.defineProperties(lazyArray, {
    length: {
     get: function() {
      if (!this.lengthKnown) {
       this.cacheLength();
      }
      return this._length;
     }
    },
    chunkSize: {
     get: function() {
      if (!this.lengthKnown) {
       this.cacheLength();
      }
      return this._chunkSize;
     }
    }
   });
   var properties = {
    isDevice: false,
    contents: lazyArray
   };
  } else {
   var properties = {
    isDevice: false,
    url: url
   };
  }
  var node = FS.createFile(parent, name, properties, canRead, canWrite);
  if (properties.contents) {
   node.contents = properties.contents;
  } else if (properties.url) {
   node.contents = null;
   node.url = properties.url;
  }
  Object.defineProperties(node, {
   usedBytes: {
    get: function() {
     return this.contents.length;
    }
   }
  });
  var stream_ops = {};
  var keys = Object.keys(node.stream_ops);
  keys.forEach(function(key) {
   var fn = node.stream_ops[key];
   stream_ops[key] = function forceLoadLazyFile() {
    if (!FS.forceLoadFile(node)) {
     throw new FS.ErrnoError(5);
    }
    return fn.apply(null, arguments);
   };
  });
  stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
   if (!FS.forceLoadFile(node)) {
    throw new FS.ErrnoError(5);
   }
   var contents = stream.node.contents;
   if (position >= contents.length) return 0;
   var size = Math.min(contents.length - position, length);
   assert(size >= 0);
   if (contents.slice) {
    for (var i = 0; i < size; i++) {
     buffer[offset + i] = contents[position + i];
    }
   } else {
    for (var i = 0; i < size; i++) {
     buffer[offset + i] = contents.get(position + i);
    }
   }
   return size;
  };
  node.stream_ops = stream_ops;
  return node;
 },
 createPreloadedFile: function(parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
  Browser.init();
  var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
  var dep = getUniqueRunDependency("cp " + fullname);
  function processData(byteArray) {
   function finish(byteArray) {
    if (preFinish) preFinish();
    if (!dontCreateFile) {
     FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
    }
    if (onload) onload();
    removeRunDependency(dep);
   }
   var handled = false;
   Module["preloadPlugins"].forEach(function(plugin) {
    if (handled) return;
    if (plugin["canHandle"](fullname)) {
     plugin["handle"](byteArray, fullname, finish, function() {
      if (onerror) onerror();
      removeRunDependency(dep);
     });
     handled = true;
    }
   });
   if (!handled) finish(byteArray);
  }
  addRunDependency(dep);
  if (typeof url == "string") {
   Browser.asyncLoad(url, function(byteArray) {
    processData(byteArray);
   }, onerror);
  } else {
   processData(url);
  }
 },
 indexedDB: function() {
  return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
 },
 DB_NAME: function() {
  return "EM_FS_" + window.location.pathname;
 },
 DB_VERSION: 20,
 DB_STORE_NAME: "FILE_DATA",
 saveFilesToDB: function(paths, onload, onerror) {
  onload = onload || function() {};
  onerror = onerror || function() {};
  var indexedDB = FS.indexedDB();
  try {
   var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
  } catch (e) {
   return onerror(e);
  }
  openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
   console.log("creating db");
   var db = openRequest.result;
   db.createObjectStore(FS.DB_STORE_NAME);
  };
  openRequest.onsuccess = function openRequest_onsuccess() {
   var db = openRequest.result;
   var transaction = db.transaction([ FS.DB_STORE_NAME ], "readwrite");
   var files = transaction.objectStore(FS.DB_STORE_NAME);
   var ok = 0, fail = 0, total = paths.length;
   function finish() {
    if (fail == 0) onload(); else onerror();
   }
   paths.forEach(function(path) {
    var putRequest = files.put(FS.analyzePath(path).object.contents, path);
    putRequest.onsuccess = function putRequest_onsuccess() {
     ok++;
     if (ok + fail == total) finish();
    };
    putRequest.onerror = function putRequest_onerror() {
     fail++;
     if (ok + fail == total) finish();
    };
   });
   transaction.onerror = onerror;
  };
  openRequest.onerror = onerror;
 },
 loadFilesFromDB: function(paths, onload, onerror) {
  onload = onload || function() {};
  onerror = onerror || function() {};
  var indexedDB = FS.indexedDB();
  try {
   var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
  } catch (e) {
   return onerror(e);
  }
  openRequest.onupgradeneeded = onerror;
  openRequest.onsuccess = function openRequest_onsuccess() {
   var db = openRequest.result;
   try {
    var transaction = db.transaction([ FS.DB_STORE_NAME ], "readonly");
   } catch (e) {
    onerror(e);
    return;
   }
   var files = transaction.objectStore(FS.DB_STORE_NAME);
   var ok = 0, fail = 0, total = paths.length;
   function finish() {
    if (fail == 0) onload(); else onerror();
   }
   paths.forEach(function(path) {
    var getRequest = files.get(path);
    getRequest.onsuccess = function getRequest_onsuccess() {
     if (FS.analyzePath(path).exists) {
      FS.unlink(path);
     }
     FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
     ok++;
     if (ok + fail == total) finish();
    };
    getRequest.onerror = function getRequest_onerror() {
     fail++;
     if (ok + fail == total) finish();
    };
   });
   transaction.onerror = onerror;
  };
  openRequest.onerror = onerror;
 }
};

var SYSCALLS = {
 DEFAULT_POLLMASK: 5,
 mappings: {},
 umask: 511,
 calculateAt: function(dirfd, path) {
  if (path[0] !== "/") {
   var dir;
   if (dirfd === -100) {
    dir = FS.cwd();
   } else {
    var dirstream = FS.getStream(dirfd);
    if (!dirstream) throw new FS.ErrnoError(9);
    dir = dirstream.path;
   }
   path = PATH.join2(dir, path);
  }
  return path;
 },
 doStat: function(func, path, buf) {
  try {
   var stat = func(path);
  } catch (e) {
   if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
    return -20;
   }
   throw e;
  }
  SAFE_HEAP_STORE(buf | 0, stat.dev | 0, 4);
  SAFE_HEAP_STORE(buf + 4 | 0, 0 | 0, 4);
  SAFE_HEAP_STORE(buf + 8 | 0, stat.ino | 0, 4);
  SAFE_HEAP_STORE(buf + 12 | 0, stat.mode | 0, 4);
  SAFE_HEAP_STORE(buf + 16 | 0, stat.nlink | 0, 4);
  SAFE_HEAP_STORE(buf + 20 | 0, stat.uid | 0, 4);
  SAFE_HEAP_STORE(buf + 24 | 0, stat.gid | 0, 4);
  SAFE_HEAP_STORE(buf + 28 | 0, stat.rdev | 0, 4);
  SAFE_HEAP_STORE(buf + 32 | 0, 0 | 0, 4);
  tempI64 = [ stat.size >>> 0, (tempDouble = stat.size, +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0) ], 
  SAFE_HEAP_STORE(buf + 40 | 0, tempI64[0] | 0, 4), SAFE_HEAP_STORE(buf + 44 | 0, tempI64[1] | 0, 4);
  SAFE_HEAP_STORE(buf + 48 | 0, 4096 | 0, 4);
  SAFE_HEAP_STORE(buf + 52 | 0, stat.blocks | 0, 4);
  SAFE_HEAP_STORE(buf + 56 | 0, stat.atime.getTime() / 1e3 | 0 | 0, 4);
  SAFE_HEAP_STORE(buf + 60 | 0, 0 | 0, 4);
  SAFE_HEAP_STORE(buf + 64 | 0, stat.mtime.getTime() / 1e3 | 0 | 0, 4);
  SAFE_HEAP_STORE(buf + 68 | 0, 0 | 0, 4);
  SAFE_HEAP_STORE(buf + 72 | 0, stat.ctime.getTime() / 1e3 | 0 | 0, 4);
  SAFE_HEAP_STORE(buf + 76 | 0, 0 | 0, 4);
  tempI64 = [ stat.ino >>> 0, (tempDouble = stat.ino, +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0) ], 
  SAFE_HEAP_STORE(buf + 80 | 0, tempI64[0] | 0, 4), SAFE_HEAP_STORE(buf + 84 | 0, tempI64[1] | 0, 4);
  return 0;
 },
 doMsync: function(addr, stream, len, flags) {
  var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
  FS.msync(stream, buffer, 0, len, flags);
 },
 doMkdir: function(path, mode) {
  path = PATH.normalize(path);
  if (path[path.length - 1] === "/") path = path.substr(0, path.length - 1);
  FS.mkdir(path, mode, 0);
  return 0;
 },
 doMknod: function(path, mode, dev) {
  switch (mode & 61440) {
  case 32768:
  case 8192:
  case 24576:
  case 4096:
  case 49152:
   break;

  default:
   return -22;
  }
  FS.mknod(path, mode, dev);
  return 0;
 },
 doReadlink: function(path, buf, bufsize) {
  if (bufsize <= 0) return -22;
  var ret = FS.readlink(path);
  var len = Math.min(bufsize, lengthBytesUTF8(ret));
  var endChar = HEAP8[buf + len];
  stringToUTF8(ret, buf, bufsize + 1);
  HEAP8[buf + len] = endChar;
  return len;
 },
 doAccess: function(path, amode) {
  if (amode & ~7) {
   return -22;
  }
  var node;
  var lookup = FS.lookupPath(path, {
   follow: true
  });
  node = lookup.node;
  var perms = "";
  if (amode & 4) perms += "r";
  if (amode & 2) perms += "w";
  if (amode & 1) perms += "x";
  if (perms && FS.nodePermissions(node, perms)) {
   return -13;
  }
  return 0;
 },
 doDup: function(path, flags, suggestFD) {
  var suggest = FS.getStream(suggestFD);
  if (suggest) FS.close(suggest);
  return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
 },
 doReadv: function(stream, iov, iovcnt, offset) {
  var ret = 0;
  for (var i = 0; i < iovcnt; i++) {
   var ptr = SAFE_HEAP_LOAD(iov + i * 8 | 0, 4, 0) | 0;
   var len = SAFE_HEAP_LOAD(iov + (i * 8 + 4) | 0, 4, 0) | 0;
   var curr = FS.read(stream, HEAP8, ptr, len, offset);
   if (curr < 0) return -1;
   ret += curr;
   if (curr < len) break;
  }
  return ret;
 },
 doWritev: function(stream, iov, iovcnt, offset) {
  var ret = 0;
  for (var i = 0; i < iovcnt; i++) {
   var ptr = SAFE_HEAP_LOAD(iov + i * 8 | 0, 4, 0) | 0;
   var len = SAFE_HEAP_LOAD(iov + (i * 8 + 4) | 0, 4, 0) | 0;
   var curr = FS.write(stream, HEAP8, ptr, len, offset);
   if (curr < 0) return -1;
   ret += curr;
  }
  return ret;
 },
 varargs: 0,
 get: function(varargs) {
  SYSCALLS.varargs += 4;
  var ret = SAFE_HEAP_LOAD(SYSCALLS.varargs - 4 | 0, 4, 0) | 0;
  return ret;
 },
 getStr: function() {
  var ret = UTF8ToString(SYSCALLS.get());
  return ret;
 },
 getStreamFromFD: function() {
  var stream = FS.getStream(SYSCALLS.get());
  if (!stream) throw new FS.ErrnoError(9);
  return stream;
 },
 get64: function() {
  var low = SYSCALLS.get(), high = SYSCALLS.get();
  if (low >= 0) assert(high === 0); else assert(high === -1);
  return low;
 },
 getZero: function() {
  assert(SYSCALLS.get() === 0);
 }
};

function ___syscall10(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var path = SYSCALLS.getStr();
   FS.unlink(path);
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall10 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall12(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var path = SYSCALLS.getStr();
   FS.chdir(path);
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall12 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall122(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var buf = SYSCALLS.get();
   if (!buf) return -14;
   var layout = {
    "sysname": 0,
    "nodename": 65,
    "domainname": 325,
    "machine": 260,
    "version": 195,
    "release": 130,
    "__size__": 390
   };
   var copyString = function(element, value) {
    var offset = layout[element];
    writeAsciiToMemory(value, buf + offset);
   };
   copyString("sysname", "Emscripten");
   copyString("nodename", "emscripten");
   copyString("release", "1.0");
   copyString("version", "#1");
   copyString("machine", "x86-JS");
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall122 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall125(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall125 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall140(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
   var HIGH_OFFSET = 4294967296;
   var offset = offset_high * HIGH_OFFSET + (offset_low >>> 0);
   var DOUBLE_LIMIT = 9007199254740992;
   if (offset <= -DOUBLE_LIMIT || offset >= DOUBLE_LIMIT) {
    return -75;
   }
   FS.llseek(stream, offset, whence);
   tempI64 = [ stream.position >>> 0, (tempDouble = stream.position, +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0) ], 
   SAFE_HEAP_STORE(result | 0, tempI64[0] | 0, 4), SAFE_HEAP_STORE(result + 4 | 0, tempI64[1] | 0, 4);
   if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall140 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall142(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var nfds = SYSCALLS.get(), readfds = SYSCALLS.get(), writefds = SYSCALLS.get(), exceptfds = SYSCALLS.get(), timeout = SYSCALLS.get();
   assert(nfds <= 64, "nfds must be less than or equal to 64");
   assert(!exceptfds, "exceptfds not supported");
   var total = 0;
   var srcReadLow = readfds ? SAFE_HEAP_LOAD(readfds | 0, 4, 0) | 0 : 0, srcReadHigh = readfds ? SAFE_HEAP_LOAD(readfds + 4 | 0, 4, 0) | 0 : 0;
   var srcWriteLow = writefds ? SAFE_HEAP_LOAD(writefds | 0, 4, 0) | 0 : 0, srcWriteHigh = writefds ? SAFE_HEAP_LOAD(writefds + 4 | 0, 4, 0) | 0 : 0;
   var srcExceptLow = exceptfds ? SAFE_HEAP_LOAD(exceptfds | 0, 4, 0) | 0 : 0, srcExceptHigh = exceptfds ? SAFE_HEAP_LOAD(exceptfds + 4 | 0, 4, 0) | 0 : 0;
   var dstReadLow = 0, dstReadHigh = 0;
   var dstWriteLow = 0, dstWriteHigh = 0;
   var dstExceptLow = 0, dstExceptHigh = 0;
   var allLow = (readfds ? SAFE_HEAP_LOAD(readfds | 0, 4, 0) | 0 : 0) | (writefds ? SAFE_HEAP_LOAD(writefds | 0, 4, 0) | 0 : 0) | (exceptfds ? SAFE_HEAP_LOAD(exceptfds | 0, 4, 0) | 0 : 0);
   var allHigh = (readfds ? SAFE_HEAP_LOAD(readfds + 4 | 0, 4, 0) | 0 : 0) | (writefds ? SAFE_HEAP_LOAD(writefds + 4 | 0, 4, 0) | 0 : 0) | (exceptfds ? SAFE_HEAP_LOAD(exceptfds + 4 | 0, 4, 0) | 0 : 0);
   var check = function(fd, low, high, val) {
    return fd < 32 ? low & val : high & val;
   };
   for (var fd = 0; fd < nfds; fd++) {
    var mask = 1 << fd % 32;
    if (!check(fd, allLow, allHigh, mask)) {
     continue;
    }
    var stream = FS.getStream(fd);
    if (!stream) throw new FS.ErrnoError(9);
    var flags = SYSCALLS.DEFAULT_POLLMASK;
    if (stream.stream_ops.poll) {
     flags = stream.stream_ops.poll(stream);
    }
    if (flags & 1 && check(fd, srcReadLow, srcReadHigh, mask)) {
     fd < 32 ? dstReadLow = dstReadLow | mask : dstReadHigh = dstReadHigh | mask;
     total++;
    }
    if (flags & 4 && check(fd, srcWriteLow, srcWriteHigh, mask)) {
     fd < 32 ? dstWriteLow = dstWriteLow | mask : dstWriteHigh = dstWriteHigh | mask;
     total++;
    }
    if (flags & 2 && check(fd, srcExceptLow, srcExceptHigh, mask)) {
     fd < 32 ? dstExceptLow = dstExceptLow | mask : dstExceptHigh = dstExceptHigh | mask;
     total++;
    }
   }
   if (readfds) {
    SAFE_HEAP_STORE(readfds | 0, dstReadLow | 0, 4);
    SAFE_HEAP_STORE(readfds + 4 | 0, dstReadHigh | 0, 4);
   }
   if (writefds) {
    SAFE_HEAP_STORE(writefds | 0, dstWriteLow | 0, 4);
    SAFE_HEAP_STORE(writefds + 4 | 0, dstWriteHigh | 0, 4);
   }
   if (exceptfds) {
    SAFE_HEAP_STORE(exceptfds | 0, dstExceptLow | 0, 4);
    SAFE_HEAP_STORE(exceptfds + 4 | 0, dstExceptHigh | 0, 4);
   }
   return total;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall142 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall145(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
   return SYSCALLS.doReadv(stream, iov, iovcnt);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall145 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall146(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
   return SYSCALLS.doWritev(stream, iov, iovcnt);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall146 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall181(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD(), buf = SYSCALLS.get(), count = SYSCALLS.get(), zero = SYSCALLS.getZero(), offset = SYSCALLS.get64();
   return FS.write(stream, HEAP8, buf, count, offset);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall181 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall183(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var buf = SYSCALLS.get(), size = SYSCALLS.get();
   if (size === 0) return -22;
   var cwd = FS.cwd();
   var cwdLengthInBytes = lengthBytesUTF8(cwd);
   if (size < cwdLengthInBytes + 1) return -34;
   stringToUTF8(cwd, buf, size);
   return buf;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall183 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall191(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var resource = SYSCALLS.get(), rlim = SYSCALLS.get();
   SAFE_HEAP_STORE(rlim | 0, -1 | 0, 4);
   SAFE_HEAP_STORE(rlim + 4 | 0, -1 | 0, 4);
   SAFE_HEAP_STORE(rlim + 8 | 0, -1 | 0, 4);
   SAFE_HEAP_STORE(rlim + 12 | 0, -1 | 0, 4);
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall191 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _memset(ptr, value, num) {
 var originalAsyncifyState = Asyncify.state;
 try {
  ptr = ptr | 0;
  value = value | 0;
  num = num | 0;
  var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
  end = ptr + num | 0;
  value = value & 255;
  if ((num | 0) >= 67) {
   while ((ptr & 3) != 0) {
    SAFE_HEAP_STORE(ptr | 0, value | 0, 1);
    ptr = ptr + 1 | 0;
   }
   aligned_end = end & -4 | 0;
   value4 = value | value << 8 | value << 16 | value << 24;
   block_aligned_end = aligned_end - 64 | 0;
   while ((ptr | 0) <= (block_aligned_end | 0)) {
    SAFE_HEAP_STORE(ptr | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 4 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 8 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 12 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 16 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 20 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 24 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 28 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 32 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 36 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 40 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 44 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 48 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 52 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 56 | 0, value4 | 0, 4);
    SAFE_HEAP_STORE(ptr + 60 | 0, value4 | 0, 4);
    ptr = ptr + 64 | 0;
   }
   while ((ptr | 0) < (aligned_end | 0)) {
    SAFE_HEAP_STORE(ptr | 0, value4 | 0, 4);
    ptr = ptr + 4 | 0;
   }
  }
  while ((ptr | 0) < (end | 0)) {
   SAFE_HEAP_STORE(ptr | 0, value | 0, 1);
   ptr = ptr + 1 | 0;
  }
  return end - num | 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import memset was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function __emscripten_syscall_mmap2(addr, len, prot, flags, fd, off) {
 var originalAsyncifyState = Asyncify.state;
 try {
  off <<= 12;
  var ptr;
  var allocated = false;
  if ((flags & 16) !== 0 && addr % PAGE_SIZE !== 0) {
   return -22;
  }
  if ((flags & 32) !== 0) {
   ptr = _memalign(PAGE_SIZE, len);
   if (!ptr) return -12;
   _memset(ptr, 0, len);
   allocated = true;
  } else {
   var info = FS.getStream(fd);
   if (!info) return -9;
   var res = FS.mmap(info, HEAPU8, addr, len, off, prot, flags);
   ptr = res.ptr;
   allocated = res.allocated;
  }
  SYSCALLS.mappings[ptr] = {
   malloc: ptr,
   len: len,
   allocated: allocated,
   fd: fd,
   flags: flags
  };
  return ptr;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import _emscripten_syscall_mmap2 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall192(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var addr = SYSCALLS.get(), len = SYSCALLS.get(), prot = SYSCALLS.get(), flags = SYSCALLS.get(), fd = SYSCALLS.get(), off = SYSCALLS.get();
   return __emscripten_syscall_mmap2(addr, len, prot, flags, fd, off);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall192 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall194(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var fd = SYSCALLS.get(), zero = SYSCALLS.getZero(), length = SYSCALLS.get64();
   FS.ftruncate(fd, length);
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall194 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall195(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var path = SYSCALLS.getStr(), buf = SYSCALLS.get();
   return SYSCALLS.doStat(FS.stat, path, buf);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall195 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall196(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var path = SYSCALLS.getStr(), buf = SYSCALLS.get();
   return SYSCALLS.doStat(FS.lstat, path, buf);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall196 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall197(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD(), buf = SYSCALLS.get();
   return SYSCALLS.doStat(FS.stat, stream.path, buf);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall197 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

var PROCINFO = {
 ppid: 1,
 pid: 42,
 sid: 42,
 pgid: 42
};

function ___syscall20(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   return PROCINFO.pid;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall20 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall219(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall219 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall221(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD(), cmd = SYSCALLS.get();
   switch (cmd) {
   case 0:
    {
     var arg = SYSCALLS.get();
     if (arg < 0) {
      return -22;
     }
     var newStream;
     newStream = FS.open(stream.path, stream.flags, 0, arg);
     return newStream.fd;
    }

   case 1:
   case 2:
    return 0;

   case 3:
    return stream.flags;

   case 4:
    {
     var arg = SYSCALLS.get();
     stream.flags |= arg;
     return 0;
    }

   case 12:
    {
     var arg = SYSCALLS.get();
     var offset = 0;
     SAFE_HEAP_STORE(arg + offset | 0, 2 | 0, 2);
     return 0;
    }

   case 13:
   case 14:
    return 0;

   case 16:
   case 8:
    return -22;

   case 9:
    ___setErrNo(22);
    return -1;

   default:
    {
     return -22;
    }
   }
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall221 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall3(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD(), buf = SYSCALLS.get(), count = SYSCALLS.get();
   return FS.read(stream, HEAP8, buf, count);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall3 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall340(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var pid = SYSCALLS.get(), resource = SYSCALLS.get(), new_limit = SYSCALLS.get(), old_limit = SYSCALLS.get();
   if (old_limit) {
    SAFE_HEAP_STORE(old_limit | 0, -1 | 0, 4);
    SAFE_HEAP_STORE(old_limit + 4 | 0, -1 | 0, 4);
    SAFE_HEAP_STORE(old_limit + 8 | 0, -1 | 0, 4);
    SAFE_HEAP_STORE(old_limit + 12 | 0, -1 | 0, 4);
   }
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall340 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall38(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var old_path = SYSCALLS.getStr(), new_path = SYSCALLS.getStr();
   FS.rename(old_path, new_path);
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall38 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall4(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD(), buf = SYSCALLS.get(), count = SYSCALLS.get();
   return FS.write(stream, HEAP8, buf, count);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall4 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall5(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var pathname = SYSCALLS.getStr(), flags = SYSCALLS.get(), mode = SYSCALLS.get();
   var stream = FS.open(pathname, flags, mode);
   return stream.fd;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall5 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall54(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD(), op = SYSCALLS.get();
   switch (op) {
   case 21509:
   case 21505:
    {
     if (!stream.tty) return -25;
     return 0;
    }

   case 21510:
   case 21511:
   case 21512:
   case 21506:
   case 21507:
   case 21508:
    {
     if (!stream.tty) return -25;
     return 0;
    }

   case 21519:
    {
     if (!stream.tty) return -25;
     var argp = SYSCALLS.get();
     SAFE_HEAP_STORE(argp | 0, 0 | 0, 4);
     return 0;
    }

   case 21520:
    {
     if (!stream.tty) return -25;
     return -22;
    }

   case 21531:
    {
     var argp = SYSCALLS.get();
     return FS.ioctl(stream, op, argp);
    }

   case 21523:
    {
     if (!stream.tty) return -25;
     return 0;
    }

   case 21524:
    {
     if (!stream.tty) return -25;
     return 0;
    }

   default:
    abort("bad ioctl syscall " + op);
   }
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall54 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall6(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var stream = SYSCALLS.getStreamFromFD();
   FS.close(stream);
   return 0;
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall6 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall85(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var path = SYSCALLS.getStr(), buf = SYSCALLS.get(), bufsize = SYSCALLS.get();
   return SYSCALLS.doReadlink(path, buf, bufsize);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall85 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function __emscripten_syscall_munmap(addr, len) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (addr === -1 || len === 0) {
   return -22;
  }
  var info = SYSCALLS.mappings[addr];
  if (!info) return 0;
  if (len === info.len) {
   var stream = FS.getStream(info.fd);
   SYSCALLS.doMsync(addr, stream, len, info.flags);
   FS.munmap(stream);
   SYSCALLS.mappings[addr] = null;
   if (info.allocated) {
    _free(info.malloc);
   }
  }
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import _emscripten_syscall_munmap was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___syscall91(which, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SYSCALLS.varargs = varargs;
  try {
   var addr = SYSCALLS.get(), len = SYSCALLS.get();
   return __emscripten_syscall_munmap(addr, len);
  } catch (e) {
   if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
   return -e.errno;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __syscall91 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___unlock() {
 var originalAsyncifyState = Asyncify.state;
 try {} finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __unlock was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___wait() {
 var originalAsyncifyState = Asyncify.state;
 try {} finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __wait was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_main_loop_timing(mode, value) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Browser.mainLoop.timingMode = mode;
  Browser.mainLoop.timingValue = value;
  if (!Browser.mainLoop.func) {
   console.error("emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.");
   return 1;
  }
  if (mode == 0) {
   Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
    var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now()) | 0;
    setTimeout(Browser.mainLoop.runner, timeUntilNextTick);
   };
   Browser.mainLoop.method = "timeout";
  } else if (mode == 1) {
   Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
    Browser.requestAnimationFrame(Browser.mainLoop.runner);
   };
   Browser.mainLoop.method = "rAF";
  } else if (mode == 2) {
   if (typeof setImmediate === "undefined") {
    var setImmediates = [];
    var emscriptenMainLoopMessageId = "setimmediate";
    var Browser_setImmediate_messageHandler = function(event) {
     if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
      event.stopPropagation();
      setImmediates.shift()();
     }
    };
    addEventListener("message", Browser_setImmediate_messageHandler, true);
    setImmediate = function Browser_emulated_setImmediate(func) {
     setImmediates.push(func);
     if (ENVIRONMENT_IS_WORKER) {
      if (Module["setImmediates"] === undefined) Module["setImmediates"] = [];
      Module["setImmediates"].push(func);
      postMessage({
       target: emscriptenMainLoopMessageId
      });
     } else postMessage(emscriptenMainLoopMessageId, "*");
    };
   }
   Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
    setImmediate(Browser.mainLoop.runner);
   };
   Browser.mainLoop.method = "immediate";
  }
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_main_loop_timing was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = true;
  assert(!Browser.mainLoop.func, "emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.");
  Browser.mainLoop.func = func;
  Browser.mainLoop.arg = arg;
  var browserIterationFunc;
  if (typeof arg !== "undefined") {
   browserIterationFunc = function() {
    Module["dynCall_vi"](func, arg);
   };
  } else {
   browserIterationFunc = function() {
    Module["dynCall_v"](func);
   };
  }
  var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
  Browser.mainLoop.runner = function Browser_mainLoop_runner() {
   if (ABORT) return;
   if (Browser.mainLoop.queue.length > 0) {
    var start = Date.now();
    var blocker = Browser.mainLoop.queue.shift();
    blocker.func(blocker.arg);
    if (Browser.mainLoop.remainingBlockers) {
     var remaining = Browser.mainLoop.remainingBlockers;
     var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
     if (blocker.counted) {
      Browser.mainLoop.remainingBlockers = next;
     } else {
      next = next + .5;
      Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
     }
    }
    console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + " ms");
    Browser.mainLoop.updateStatus();
    if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
    setTimeout(Browser.mainLoop.runner, 0);
    return;
   }
   if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
   Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
   if (Browser.mainLoop.timingMode == 1 && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
    Browser.mainLoop.scheduler();
    return;
   } else if (Browser.mainLoop.timingMode == 0) {
    Browser.mainLoop.tickStartTime = _emscripten_get_now();
   }
   if (Browser.mainLoop.method === "timeout" && Module.ctx) {
    err("Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!");
    Browser.mainLoop.method = "";
   }
   Browser.mainLoop.runIter(browserIterationFunc);
   checkStackCookie();
   if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
   if (typeof SDL === "object" && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
   Browser.mainLoop.scheduler();
  };
  if (!noSetTiming) {
   if (fps && fps > 0) _emscripten_set_main_loop_timing(0, 1e3 / fps); else _emscripten_set_main_loop_timing(1, 1);
   Browser.mainLoop.scheduler();
  }
  if (simulateInfiniteLoop) {
   throw "SimulateInfiniteLoop";
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_main_loop was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

var Browser = {
 mainLoop: {
  scheduler: null,
  method: "",
  currentlyRunningMainloop: 0,
  func: null,
  arg: 0,
  timingMode: 0,
  timingValue: 0,
  currentFrameNumber: 0,
  queue: [],
  pause: function() {
   Browser.mainLoop.scheduler = null;
   Browser.mainLoop.currentlyRunningMainloop++;
  },
  resume: function() {
   Browser.mainLoop.currentlyRunningMainloop++;
   var timingMode = Browser.mainLoop.timingMode;
   var timingValue = Browser.mainLoop.timingValue;
   var func = Browser.mainLoop.func;
   Browser.mainLoop.func = null;
   _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg, true);
   _emscripten_set_main_loop_timing(timingMode, timingValue);
   Browser.mainLoop.scheduler();
  },
  updateStatus: function() {
   if (Module["setStatus"]) {
    var message = Module["statusMessage"] || "Please wait...";
    var remaining = Browser.mainLoop.remainingBlockers;
    var expected = Browser.mainLoop.expectedBlockers;
    if (remaining) {
     if (remaining < expected) {
      Module["setStatus"](message + " (" + (expected - remaining) + "/" + expected + ")");
     } else {
      Module["setStatus"](message);
     }
    } else {
     Module["setStatus"]("");
    }
   }
  },
  runIter: function(func) {
   if (ABORT) return;
   if (Module["preMainLoop"]) {
    var preRet = Module["preMainLoop"]();
    if (preRet === false) {
     return;
    }
   }
   try {
    func();
   } catch (e) {
    if (e instanceof ExitStatus) {
     return;
    } else {
     if (e && typeof e === "object" && e.stack) err("exception thrown: " + [ e, e.stack ]);
     throw e;
    }
   }
   if (Module["postMainLoop"]) Module["postMainLoop"]();
  }
 },
 isFullscreen: false,
 pointerLock: false,
 moduleContextCreatedCallbacks: [],
 workers: [],
 init: function() {
  if (!Module["preloadPlugins"]) Module["preloadPlugins"] = [];
  if (Browser.initted) return;
  Browser.initted = true;
  try {
   new Blob();
   Browser.hasBlobConstructor = true;
  } catch (e) {
   Browser.hasBlobConstructor = false;
   console.log("warning: no blob constructor, cannot create blobs with mimetypes");
  }
  Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : !Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null;
  Browser.URLObject = typeof window != "undefined" ? window.URL ? window.URL : window.webkitURL : undefined;
  if (!Module.noImageDecoding && typeof Browser.URLObject === "undefined") {
   console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
   Module.noImageDecoding = true;
  }
  var imagePlugin = {};
  imagePlugin["canHandle"] = function imagePlugin_canHandle(name) {
   return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
  };
  imagePlugin["handle"] = function imagePlugin_handle(byteArray, name, onload, onerror) {
   var b = null;
   if (Browser.hasBlobConstructor) {
    try {
     b = new Blob([ byteArray ], {
      type: Browser.getMimetype(name)
     });
     if (b.size !== byteArray.length) {
      b = new Blob([ new Uint8Array(byteArray).buffer ], {
       type: Browser.getMimetype(name)
      });
     }
    } catch (e) {
     warnOnce("Blob constructor present but fails: " + e + "; falling back to blob builder");
    }
   }
   if (!b) {
    var bb = new Browser.BlobBuilder();
    bb.append(new Uint8Array(byteArray).buffer);
    b = bb.getBlob();
   }
   var url = Browser.URLObject.createObjectURL(b);
   assert(typeof url == "string", "createObjectURL must return a url as a string");
   var img = new Image();
   img.onload = function img_onload() {
    assert(img.complete, "Image " + name + " could not be decoded");
    var canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    Module["preloadedImages"][name] = canvas;
    Browser.URLObject.revokeObjectURL(url);
    if (onload) onload(byteArray);
   };
   img.onerror = function img_onerror(event) {
    console.log("Image " + url + " could not be decoded");
    if (onerror) onerror();
   };
   img.src = url;
  };
  Module["preloadPlugins"].push(imagePlugin);
  var audioPlugin = {};
  audioPlugin["canHandle"] = function audioPlugin_canHandle(name) {
   return !Module.noAudioDecoding && name.substr(-4) in {
    ".ogg": 1,
    ".wav": 1,
    ".mp3": 1
   };
  };
  audioPlugin["handle"] = function audioPlugin_handle(byteArray, name, onload, onerror) {
   var done = false;
   function finish(audio) {
    if (done) return;
    done = true;
    Module["preloadedAudios"][name] = audio;
    if (onload) onload(byteArray);
   }
   function fail() {
    if (done) return;
    done = true;
    Module["preloadedAudios"][name] = new Audio();
    if (onerror) onerror();
   }
   if (Browser.hasBlobConstructor) {
    try {
     var b = new Blob([ byteArray ], {
      type: Browser.getMimetype(name)
     });
    } catch (e) {
     return fail();
    }
    var url = Browser.URLObject.createObjectURL(b);
    assert(typeof url == "string", "createObjectURL must return a url as a string");
    var audio = new Audio();
    audio.addEventListener("canplaythrough", function() {
     finish(audio);
    }, false);
    audio.onerror = function audio_onerror(event) {
     if (done) return;
     console.log("warning: browser could not fully decode audio " + name + ", trying slower base64 approach");
     function encode64(data) {
      var BASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      var PAD = "=";
      var ret = "";
      var leftchar = 0;
      var leftbits = 0;
      for (var i = 0; i < data.length; i++) {
       leftchar = leftchar << 8 | data[i];
       leftbits += 8;
       while (leftbits >= 6) {
        var curr = leftchar >> leftbits - 6 & 63;
        leftbits -= 6;
        ret += BASE[curr];
       }
      }
      if (leftbits == 2) {
       ret += BASE[(leftchar & 3) << 4];
       ret += PAD + PAD;
      } else if (leftbits == 4) {
       ret += BASE[(leftchar & 15) << 2];
       ret += PAD;
      }
      return ret;
     }
     audio.src = "data:audio/x-" + name.substr(-3) + ";base64," + encode64(byteArray);
     finish(audio);
    };
    audio.src = url;
    Browser.safeSetTimeout(function() {
     finish(audio);
    }, 1e4);
   } else {
    return fail();
   }
  };
  Module["preloadPlugins"].push(audioPlugin);
  function pointerLockChange() {
   Browser.pointerLock = document["pointerLockElement"] === Module["canvas"] || document["mozPointerLockElement"] === Module["canvas"] || document["webkitPointerLockElement"] === Module["canvas"] || document["msPointerLockElement"] === Module["canvas"];
  }
  var canvas = Module["canvas"];
  if (canvas) {
   canvas.requestPointerLock = canvas["requestPointerLock"] || canvas["mozRequestPointerLock"] || canvas["webkitRequestPointerLock"] || canvas["msRequestPointerLock"] || function() {};
   canvas.exitPointerLock = document["exitPointerLock"] || document["mozExitPointerLock"] || document["webkitExitPointerLock"] || document["msExitPointerLock"] || function() {};
   canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
   document.addEventListener("pointerlockchange", pointerLockChange, false);
   document.addEventListener("mozpointerlockchange", pointerLockChange, false);
   document.addEventListener("webkitpointerlockchange", pointerLockChange, false);
   document.addEventListener("mspointerlockchange", pointerLockChange, false);
   if (Module["elementPointerLock"]) {
    canvas.addEventListener("click", function(ev) {
     if (!Browser.pointerLock && Module["canvas"].requestPointerLock) {
      Module["canvas"].requestPointerLock();
      ev.preventDefault();
     }
    }, false);
   }
  }
 },
 createContext: function(canvas, useWebGL, setInModule, webGLContextAttributes) {
  if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx;
  var ctx;
  var contextHandle;
  if (useWebGL) {
   var contextAttributes = {
    antialias: false,
    alpha: false,
    majorVersion: 1
   };
   if (webGLContextAttributes) {
    for (var attribute in webGLContextAttributes) {
     contextAttributes[attribute] = webGLContextAttributes[attribute];
    }
   }
   if (typeof GL !== "undefined") {
    contextHandle = GL.createContext(canvas, contextAttributes);
    if (contextHandle) {
     ctx = GL.getContext(contextHandle).GLctx;
    }
   }
  } else {
   ctx = canvas.getContext("2d");
  }
  if (!ctx) return null;
  if (setInModule) {
   if (!useWebGL) assert(typeof GLctx === "undefined", "cannot set in module if GLctx is used, but we are a non-GL context that would replace it");
   Module.ctx = ctx;
   if (useWebGL) GL.makeContextCurrent(contextHandle);
   Module.useWebGL = useWebGL;
   Browser.moduleContextCreatedCallbacks.forEach(function(callback) {
    callback();
   });
   Browser.init();
  }
  return ctx;
 },
 destroyContext: function(canvas, useWebGL, setInModule) {},
 fullscreenHandlersInstalled: false,
 lockPointer: undefined,
 resizeCanvas: undefined,
 requestFullscreen: function(lockPointer, resizeCanvas, vrDevice) {
  Browser.lockPointer = lockPointer;
  Browser.resizeCanvas = resizeCanvas;
  Browser.vrDevice = vrDevice;
  if (typeof Browser.lockPointer === "undefined") Browser.lockPointer = true;
  if (typeof Browser.resizeCanvas === "undefined") Browser.resizeCanvas = false;
  if (typeof Browser.vrDevice === "undefined") Browser.vrDevice = null;
  var canvas = Module["canvas"];
  function fullscreenChange() {
   Browser.isFullscreen = false;
   var canvasContainer = canvas.parentNode;
   if ((document["fullscreenElement"] || document["mozFullScreenElement"] || document["msFullscreenElement"] || document["webkitFullscreenElement"] || document["webkitCurrentFullScreenElement"]) === canvasContainer) {
    canvas.exitFullscreen = Browser.exitFullscreen;
    if (Browser.lockPointer) canvas.requestPointerLock();
    Browser.isFullscreen = true;
    if (Browser.resizeCanvas) {
     Browser.setFullscreenCanvasSize();
    } else {
     Browser.updateCanvasDimensions(canvas);
    }
   } else {
    canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
    canvasContainer.parentNode.removeChild(canvasContainer);
    if (Browser.resizeCanvas) {
     Browser.setWindowedCanvasSize();
    } else {
     Browser.updateCanvasDimensions(canvas);
    }
   }
   if (Module["onFullScreen"]) Module["onFullScreen"](Browser.isFullscreen);
   if (Module["onFullscreen"]) Module["onFullscreen"](Browser.isFullscreen);
  }
  if (!Browser.fullscreenHandlersInstalled) {
   Browser.fullscreenHandlersInstalled = true;
   document.addEventListener("fullscreenchange", fullscreenChange, false);
   document.addEventListener("mozfullscreenchange", fullscreenChange, false);
   document.addEventListener("webkitfullscreenchange", fullscreenChange, false);
   document.addEventListener("MSFullscreenChange", fullscreenChange, false);
  }
  var canvasContainer = document.createElement("div");
  canvas.parentNode.insertBefore(canvasContainer, canvas);
  canvasContainer.appendChild(canvas);
  canvasContainer.requestFullscreen = canvasContainer["requestFullscreen"] || canvasContainer["mozRequestFullScreen"] || canvasContainer["msRequestFullscreen"] || (canvasContainer["webkitRequestFullscreen"] ? function() {
   canvasContainer["webkitRequestFullscreen"](Element["ALLOW_KEYBOARD_INPUT"]);
  } : null) || (canvasContainer["webkitRequestFullScreen"] ? function() {
   canvasContainer["webkitRequestFullScreen"](Element["ALLOW_KEYBOARD_INPUT"]);
  } : null);
  if (vrDevice) {
   canvasContainer.requestFullscreen({
    vrDisplay: vrDevice
   });
  } else {
   canvasContainer.requestFullscreen();
  }
 },
 requestFullScreen: function(lockPointer, resizeCanvas, vrDevice) {
  err("Browser.requestFullScreen() is deprecated. Please call Browser.requestFullscreen instead.");
  Browser.requestFullScreen = function(lockPointer, resizeCanvas, vrDevice) {
   return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
  };
  return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
 },
 exitFullscreen: function() {
  if (!Browser.isFullscreen) {
   return false;
  }
  var CFS = document["exitFullscreen"] || document["cancelFullScreen"] || document["mozCancelFullScreen"] || document["msExitFullscreen"] || document["webkitCancelFullScreen"] || function() {};
  CFS.apply(document, []);
  return true;
 },
 nextRAF: 0,
 fakeRequestAnimationFrame: function(func) {
  var now = Date.now();
  if (Browser.nextRAF === 0) {
   Browser.nextRAF = now + 1e3 / 60;
  } else {
   while (now + 2 >= Browser.nextRAF) {
    Browser.nextRAF += 1e3 / 60;
   }
  }
  var delay = Math.max(Browser.nextRAF - now, 0);
  setTimeout(func, delay);
 },
 requestAnimationFrame: function(func) {
  if (typeof requestAnimationFrame === "function") {
   requestAnimationFrame(func);
   return;
  }
  var RAF = Browser.fakeRequestAnimationFrame;
  RAF(func);
 },
 safeCallback: function(func) {
  return function() {
   if (!ABORT) return func.apply(null, arguments);
  };
 },
 allowAsyncCallbacks: true,
 queuedAsyncCallbacks: [],
 pauseAsyncCallbacks: function() {
  Browser.allowAsyncCallbacks = false;
 },
 resumeAsyncCallbacks: function() {
  Browser.allowAsyncCallbacks = true;
  if (Browser.queuedAsyncCallbacks.length > 0) {
   var callbacks = Browser.queuedAsyncCallbacks;
   Browser.queuedAsyncCallbacks = [];
   callbacks.forEach(function(func) {
    func();
   });
  }
 },
 safeRequestAnimationFrame: function(func) {
  return Browser.requestAnimationFrame(function() {
   if (ABORT) return;
   if (Browser.allowAsyncCallbacks) {
    func();
   } else {
    Browser.queuedAsyncCallbacks.push(func);
   }
  });
 },
 safeSetTimeout: function(func, timeout) {
  Module["noExitRuntime"] = true;
  return setTimeout(function() {
   if (ABORT) return;
   if (Browser.allowAsyncCallbacks) {
    func();
   } else {
    Browser.queuedAsyncCallbacks.push(func);
   }
  }, timeout);
 },
 safeSetInterval: function(func, timeout) {
  Module["noExitRuntime"] = true;
  return setInterval(function() {
   if (ABORT) return;
   if (Browser.allowAsyncCallbacks) {
    func();
   }
  }, timeout);
 },
 getMimetype: function(name) {
  return {
   "jpg": "image/jpeg",
   "jpeg": "image/jpeg",
   "png": "image/png",
   "bmp": "image/bmp",
   "ogg": "audio/ogg",
   "wav": "audio/wav",
   "mp3": "audio/mpeg"
  }[name.substr(name.lastIndexOf(".") + 1)];
 },
 getUserMedia: function(func) {
  if (!window.getUserMedia) {
   window.getUserMedia = navigator["getUserMedia"] || navigator["mozGetUserMedia"];
  }
  window.getUserMedia(func);
 },
 getMovementX: function(event) {
  return event["movementX"] || event["mozMovementX"] || event["webkitMovementX"] || 0;
 },
 getMovementY: function(event) {
  return event["movementY"] || event["mozMovementY"] || event["webkitMovementY"] || 0;
 },
 getMouseWheelDelta: function(event) {
  var delta = 0;
  switch (event.type) {
  case "DOMMouseScroll":
   delta = event.detail / 3;
   break;

  case "mousewheel":
   delta = event.wheelDelta / 120;
   break;

  case "wheel":
   delta = event.deltaY;
   switch (event.deltaMode) {
   case 0:
    delta /= 100;
    break;

   case 1:
    delta /= 3;
    break;

   case 2:
    delta *= 80;
    break;

   default:
    throw "unrecognized mouse wheel delta mode: " + event.deltaMode;
   }
   break;

  default:
   throw "unrecognized mouse wheel event: " + event.type;
  }
  return delta;
 },
 mouseX: 0,
 mouseY: 0,
 mouseMovementX: 0,
 mouseMovementY: 0,
 touches: {},
 lastTouches: {},
 calculateMouseEvent: function(event) {
  if (Browser.pointerLock) {
   if (event.type != "mousemove" && "mozMovementX" in event) {
    Browser.mouseMovementX = Browser.mouseMovementY = 0;
   } else {
    Browser.mouseMovementX = Browser.getMovementX(event);
    Browser.mouseMovementY = Browser.getMovementY(event);
   }
   if (typeof SDL != "undefined") {
    Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
    Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
   } else {
    Browser.mouseX += Browser.mouseMovementX;
    Browser.mouseY += Browser.mouseMovementY;
   }
  } else {
   var rect = Module["canvas"].getBoundingClientRect();
   var cw = Module["canvas"].width;
   var ch = Module["canvas"].height;
   var scrollX = typeof window.scrollX !== "undefined" ? window.scrollX : window.pageXOffset;
   var scrollY = typeof window.scrollY !== "undefined" ? window.scrollY : window.pageYOffset;
   assert(typeof scrollX !== "undefined" && typeof scrollY !== "undefined", "Unable to retrieve scroll position, mouse positions likely broken.");
   if (event.type === "touchstart" || event.type === "touchend" || event.type === "touchmove") {
    var touch = event.touch;
    if (touch === undefined) {
     return;
    }
    var adjustedX = touch.pageX - (scrollX + rect.left);
    var adjustedY = touch.pageY - (scrollY + rect.top);
    adjustedX = adjustedX * (cw / rect.width);
    adjustedY = adjustedY * (ch / rect.height);
    var coords = {
     x: adjustedX,
     y: adjustedY
    };
    if (event.type === "touchstart") {
     Browser.lastTouches[touch.identifier] = coords;
     Browser.touches[touch.identifier] = coords;
    } else if (event.type === "touchend" || event.type === "touchmove") {
     var last = Browser.touches[touch.identifier];
     if (!last) last = coords;
     Browser.lastTouches[touch.identifier] = last;
     Browser.touches[touch.identifier] = coords;
    }
    return;
   }
   var x = event.pageX - (scrollX + rect.left);
   var y = event.pageY - (scrollY + rect.top);
   x = x * (cw / rect.width);
   y = y * (ch / rect.height);
   Browser.mouseMovementX = x - Browser.mouseX;
   Browser.mouseMovementY = y - Browser.mouseY;
   Browser.mouseX = x;
   Browser.mouseY = y;
  }
 },
 asyncLoad: function(url, onload, onerror, noRunDep) {
  var dep = !noRunDep ? getUniqueRunDependency("al " + url) : "";
  readAsync(url, function(arrayBuffer) {
   assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
   onload(new Uint8Array(arrayBuffer));
   if (dep) removeRunDependency(dep);
  }, function(event) {
   if (onerror) {
    onerror();
   } else {
    throw 'Loading data file "' + url + '" failed.';
   }
  });
  if (dep) addRunDependency(dep);
 },
 resizeListeners: [],
 updateResizeListeners: function() {
  var canvas = Module["canvas"];
  Browser.resizeListeners.forEach(function(listener) {
   listener(canvas.width, canvas.height);
  });
 },
 setCanvasSize: function(width, height, noUpdates) {
  var canvas = Module["canvas"];
  Browser.updateCanvasDimensions(canvas, width, height);
  if (!noUpdates) Browser.updateResizeListeners();
 },
 windowedWidth: 0,
 windowedHeight: 0,
 setFullscreenCanvasSize: function() {
  if (typeof SDL != "undefined") {
   var flags = SAFE_HEAP_LOAD(SDL.screen | 0, 4, 1) | 0;
   flags = flags | 8388608;
   SAFE_HEAP_STORE(SDL.screen | 0, flags | 0, 4);
  }
  Browser.updateCanvasDimensions(Module["canvas"]);
  Browser.updateResizeListeners();
 },
 setWindowedCanvasSize: function() {
  if (typeof SDL != "undefined") {
   var flags = SAFE_HEAP_LOAD(SDL.screen | 0, 4, 1) | 0;
   flags = flags & ~8388608;
   SAFE_HEAP_STORE(SDL.screen | 0, flags | 0, 4);
  }
  Browser.updateCanvasDimensions(Module["canvas"]);
  Browser.updateResizeListeners();
 },
 updateCanvasDimensions: function(canvas, wNative, hNative) {
  if (wNative && hNative) {
   canvas.widthNative = wNative;
   canvas.heightNative = hNative;
  } else {
   wNative = canvas.widthNative;
   hNative = canvas.heightNative;
  }
  var w = wNative;
  var h = hNative;
  if (Module["forcedAspectRatio"] && Module["forcedAspectRatio"] > 0) {
   if (w / h < Module["forcedAspectRatio"]) {
    w = Math.round(h * Module["forcedAspectRatio"]);
   } else {
    h = Math.round(w / Module["forcedAspectRatio"]);
   }
  }
  if ((document["fullscreenElement"] || document["mozFullScreenElement"] || document["msFullscreenElement"] || document["webkitFullscreenElement"] || document["webkitCurrentFullScreenElement"]) === canvas.parentNode && typeof screen != "undefined") {
   var factor = Math.min(screen.width / w, screen.height / h);
   w = Math.round(w * factor);
   h = Math.round(h * factor);
  }
  if (Browser.resizeCanvas) {
   if (canvas.width != w) canvas.width = w;
   if (canvas.height != h) canvas.height = h;
   if (typeof canvas.style != "undefined") {
    canvas.style.removeProperty("width");
    canvas.style.removeProperty("height");
   }
  } else {
   if (canvas.width != wNative) canvas.width = wNative;
   if (canvas.height != hNative) canvas.height = hNative;
   if (typeof canvas.style != "undefined") {
    if (w != wNative || h != hNative) {
     canvas.style.setProperty("width", w + "px", "important");
     canvas.style.setProperty("height", h + "px", "important");
    } else {
     canvas.style.removeProperty("width");
     canvas.style.removeProperty("height");
    }
   }
  }
 },
 wgetRequests: {},
 nextWgetRequestHandle: 0,
 getNextWgetRequestHandle: function() {
  var handle = Browser.nextWgetRequestHandle;
  Browser.nextWgetRequestHandle++;
  return handle;
 }
};

function __emscripten_push_main_loop_blocker(func, arg, name) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Browser.mainLoop.queue.push({
   func: function() {
    dynCall_vi(func, arg);
   },
   name: UTF8ToString(name),
   counted: true
  });
  Browser.mainLoop.updateStatus();
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import _emscripten_push_main_loop_blocker was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function __emscripten_push_uncounted_main_loop_blocker(func, arg, name) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Browser.mainLoop.queue.push({
   func: function() {
    dynCall_vi(func, arg);
   },
   name: UTF8ToString(name),
   counted: false
  });
  Browser.mainLoop.updateStatus();
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import _emscripten_push_uncounted_main_loop_blocker was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _abort() {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["abort"]();
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import abort was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _dlopen() {
 var originalAsyncifyState = Asyncify.state;
 try {
  abort("To use dlopen, you need to use Emscripten's linking support, see https://github.com/emscripten-core/emscripten/wiki/Linking");
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import dlopen was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _dladdr() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return _dlopen.apply(null, arguments);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import dladdr was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _dlclose() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return _dlopen.apply(null, arguments);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import dlclose was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _dlerror() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return _dlopen.apply(null, arguments);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import dlerror was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _dlinfo() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: dlinfo");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import dlinfo was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _dlsym() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return _dlopen.apply(null, arguments);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import dlsym was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_async_call(func, arg, millis) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = true;
  function wrapper() {
   getFuncWrapper(func, "vi")(arg);
  }
  if (millis >= 0) {
   Browser.safeSetTimeout(wrapper, millis);
  } else {
   Browser.safeRequestAnimationFrame(wrapper);
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_async_call was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_async_load_script(url, onload, onerror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  onload = getFuncWrapper(onload, "v");
  onerror = getFuncWrapper(onerror, "v");
  Module["noExitRuntime"] = true;
  assert(runDependencies === 0, "async_load_script must be run when no other dependencies are active");
  var script = document.createElement("script");
  if (onload) {
   script.onload = function script_onload() {
    if (runDependencies > 0) {
     dependenciesFulfilled = onload;
    } else {
     onload();
    }
   };
  }
  if (onerror) script.onerror = onerror;
  script.src = UTF8ToString(url);
  document.body.appendChild(script);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_async_load_script was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_run_script(ptr) {
 var originalAsyncifyState = Asyncify.state;
 try {
  eval(UTF8ToString(ptr));
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_run_script was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_async_run_script(script, millis) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = true;
  Browser.safeSetTimeout(function() {
   _emscripten_run_script(script);
  }, millis);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_async_run_script was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_async_wget(url, file, onload, onerror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = true;
  var _url = UTF8ToString(url);
  var _file = UTF8ToString(file);
  _file = PATH_FS.resolve(_file);
  function doCallback(callback) {
   if (callback) {
    var stack = stackSave();
    dynCall_vi(callback, allocate(intArrayFromString(_file), "i8", ALLOC_STACK));
    stackRestore(stack);
   }
  }
  var destinationDirectory = PATH.dirname(_file);
  FS.createPreloadedFile(destinationDirectory, PATH.basename(_file), _url, true, true, function() {
   doCallback(onload);
  }, function() {
   doCallback(onerror);
  }, false, false, function() {
   try {
    FS.unlink(_file);
   } catch (e) {}
   FS.mkdirTree(destinationDirectory);
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_async_wget was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_async_wget2(url, file, request, param, arg, onload, onerror, onprogress) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = true;
  var _url = UTF8ToString(url);
  var _file = UTF8ToString(file);
  _file = PATH_FS.resolve(_file);
  var _request = UTF8ToString(request);
  var _param = UTF8ToString(param);
  var index = _file.lastIndexOf("/");
  var http = new XMLHttpRequest();
  http.open(_request, _url, true);
  http.responseType = "arraybuffer";
  var handle = Browser.getNextWgetRequestHandle();
  var destinationDirectory = PATH.dirname(_file);
  http.onload = function http_onload(e) {
   if (http.status >= 200 && http.status < 300) {
    try {
     FS.unlink(_file);
    } catch (e) {}
    FS.mkdirTree(destinationDirectory);
    FS.createDataFile(_file.substr(0, index), _file.substr(index + 1), new Uint8Array(http.response), true, true, false);
    if (onload) {
     var stack = stackSave();
     dynCall_viii(onload, handle, arg, allocate(intArrayFromString(_file), "i8", ALLOC_STACK));
     stackRestore(stack);
    }
   } else {
    if (onerror) dynCall_viii(onerror, handle, arg, http.status);
   }
   delete Browser.wgetRequests[handle];
  };
  http.onerror = function http_onerror(e) {
   if (onerror) dynCall_viii(onerror, handle, arg, http.status);
   delete Browser.wgetRequests[handle];
  };
  http.onprogress = function http_onprogress(e) {
   if (e.lengthComputable || e.lengthComputable === undefined && e.total != 0) {
    var percentComplete = e.loaded / e.total * 100;
    if (onprogress) dynCall_viii(onprogress, handle, arg, percentComplete);
   }
  };
  http.onabort = function http_onabort(e) {
   delete Browser.wgetRequests[handle];
  };
  if (_request == "POST") {
   http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
   http.send(_param);
  } else {
   http.send(null);
  }
  Browser.wgetRequests[handle] = http;
  return handle;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_async_wget2 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_async_wget2_abort(handle) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var http = Browser.wgetRequests[handle];
  if (http) {
   http.abort();
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_async_wget2_abort was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_async_wget2_data(url, request, param, arg, free, onload, onerror, onprogress) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var _url = UTF8ToString(url);
  var _request = UTF8ToString(request);
  var _param = UTF8ToString(param);
  var http = new XMLHttpRequest();
  http.open(_request, _url, true);
  http.responseType = "arraybuffer";
  var handle = Browser.getNextWgetRequestHandle();
  http.onload = function http_onload(e) {
   if (http.status >= 200 && http.status < 300 || _url.substr(0, 4).toLowerCase() != "http") {
    var byteArray = new Uint8Array(http.response);
    var buffer = _malloc(byteArray.length);
    HEAPU8.set(byteArray, buffer);
    if (onload) dynCall_viiii(onload, handle, arg, buffer, byteArray.length);
    if (free) _free(buffer);
   } else {
    if (onerror) dynCall_viiii(onerror, handle, arg, http.status, http.statusText);
   }
   delete Browser.wgetRequests[handle];
  };
  http.onerror = function http_onerror(e) {
   if (onerror) {
    dynCall_viiii(onerror, handle, arg, http.status, http.statusText);
   }
   delete Browser.wgetRequests[handle];
  };
  http.onprogress = function http_onprogress(e) {
   if (onprogress) dynCall_viiii(onprogress, handle, arg, e.loaded, e.lengthComputable || e.lengthComputable === undefined ? e.total : 0);
  };
  http.onabort = function http_onabort(e) {
   delete Browser.wgetRequests[handle];
  };
  if (_request == "POST") {
   http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
   http.send(_param);
  } else {
   http.send(null);
  }
  Browser.wgetRequests[handle] = http;
  return handle;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_async_wget2_data was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_async_wget_data(url, arg, onload, onerror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Browser.asyncLoad(UTF8ToString(url), function(byteArray) {
   var buffer = _malloc(byteArray.length);
   HEAPU8.set(byteArray, buffer);
   dynCall_viii(onload, arg, buffer, byteArray.length);
   _free(buffer);
  }, function() {
   if (onerror) dynCall_vi(onerror, arg);
  }, true);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_async_wget_data was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_call_worker(id, funcName, data, size, callback, arg) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = true;
  funcName = UTF8ToString(funcName);
  var info = Browser.workers[id];
  var callbackId = -1;
  if (callback) {
   callbackId = info.callbacks.length;
   info.callbacks.push({
    func: getFuncWrapper(callback, "viii"),
    arg: arg
   });
   info.awaited++;
  }
  var transferObject = {
   "funcName": funcName,
   "callbackId": callbackId,
   "data": data ? new Uint8Array(HEAPU8.subarray(data, data + size)) : 0
  };
  if (data) {
   info.worker.postMessage(transferObject, [ transferObject.data.buffer ]);
  } else {
   info.worker.postMessage(transferObject);
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_call_worker was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_cancel_main_loop() {
 var originalAsyncifyState = Asyncify.state;
 try {
  Browser.mainLoop.pause();
  Browser.mainLoop.func = null;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_cancel_main_loop was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_coroutine_create() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: emscripten_coroutine_create");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_coroutine_create was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_coroutine_next() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: emscripten_coroutine_next");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_coroutine_next was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_create_worker(url) {
 var originalAsyncifyState = Asyncify.state;
 try {
  url = UTF8ToString(url);
  var id = Browser.workers.length;
  var info = {
   worker: new Worker(url),
   callbacks: [],
   awaited: 0,
   buffer: 0,
   bufferSize: 0
  };
  info.worker.onmessage = function info_worker_onmessage(msg) {
   if (ABORT) return;
   var info = Browser.workers[id];
   if (!info) return;
   var callbackId = msg.data["callbackId"];
   var callbackInfo = info.callbacks[callbackId];
   if (!callbackInfo) return;
   if (msg.data["finalResponse"]) {
    info.awaited--;
    info.callbacks[callbackId] = null;
   }
   var data = msg.data["data"];
   if (data) {
    if (!data.byteLength) data = new Uint8Array(data);
    if (!info.buffer || info.bufferSize < data.length) {
     if (info.buffer) _free(info.buffer);
     info.bufferSize = data.length;
     info.buffer = _malloc(data.length);
    }
    HEAPU8.set(data, info.buffer);
    callbackInfo.func(info.buffer, data.length, callbackInfo.arg);
   } else {
    callbackInfo.func(0, 0, callbackInfo.arg);
   }
  };
  Browser.workers.push(info);
  return id;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_create_worker was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_debugger() {
 var originalAsyncifyState = Asyncify.state;
 try {
  debugger;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_debugger was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_destroy_worker(id) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var info = Browser.workers[id];
  info.worker.terminate();
  if (info.buffer) _free(info.buffer);
  Browser.workers[id] = null;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_destroy_worker was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_exit_with_live_runtime() {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = true;
  throw "SimulateInfiniteLoop";
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_exit_with_live_runtime was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_force_exit(status) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = false;
  exit(status);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_force_exit was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function __emscripten_traverse_stack(args) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (!args || !args.callee || !args.callee.name) {
   return [ null, "", "" ];
  }
  var funstr = args.callee.toString();
  var funcname = args.callee.name;
  var str = "(";
  var first = true;
  for (var i in args) {
   var a = args[i];
   if (!first) {
    str += ", ";
   }
   first = false;
   if (typeof a === "number" || typeof a === "string") {
    str += a;
   } else {
    str += "(" + typeof a + ")";
   }
  }
  str += ")";
  var caller = args.callee.caller;
  args = caller ? caller.arguments : [];
  if (first) str = "";
  return [ args, funcname, str ];
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import _emscripten_traverse_stack was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_callstack_js(flags) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var callstack = jsStackTrace();
  var iThisFunc = callstack.lastIndexOf("_emscripten_log");
  var iThisFunc2 = callstack.lastIndexOf("_emscripten_get_callstack");
  var iNextLine = callstack.indexOf("\n", Math.max(iThisFunc, iThisFunc2)) + 1;
  callstack = callstack.slice(iNextLine);
  if (flags & 8 && typeof emscripten_source_map === "undefined") {
   warnOnce('Source map information is not available, emscripten_log with EM_LOG_C_STACK will be ignored. Build with "--pre-js $EMSCRIPTEN/src/emscripten-source-map.min.js" linker flag to add source map loading to code.');
   flags ^= 8;
   flags |= 16;
  }
  var stack_args = null;
  if (flags & 128) {
   stack_args = __emscripten_traverse_stack(arguments);
   while (stack_args[1].indexOf("_emscripten_") >= 0) stack_args = __emscripten_traverse_stack(stack_args[0]);
  }
  var lines = callstack.split("\n");
  callstack = "";
  var newFirefoxRe = new RegExp("\\s*(.*?)@(.*?):([0-9]+):([0-9]+)");
  var firefoxRe = new RegExp("\\s*(.*?)@(.*):(.*)(:(.*))?");
  var chromeRe = new RegExp("\\s*at (.*?) \\((.*):(.*):(.*)\\)");
  for (var l in lines) {
   var line = lines[l];
   var jsSymbolName = "";
   var file = "";
   var lineno = 0;
   var column = 0;
   var parts = chromeRe.exec(line);
   if (parts && parts.length == 5) {
    jsSymbolName = parts[1];
    file = parts[2];
    lineno = parts[3];
    column = parts[4];
   } else {
    parts = newFirefoxRe.exec(line);
    if (!parts) parts = firefoxRe.exec(line);
    if (parts && parts.length >= 4) {
     jsSymbolName = parts[1];
     file = parts[2];
     lineno = parts[3];
     column = parts[4] | 0;
    } else {
     callstack += line + "\n";
     continue;
    }
   }
   var cSymbolName = flags & 32 ? demangle(jsSymbolName) : jsSymbolName;
   if (!cSymbolName) {
    cSymbolName = jsSymbolName;
   }
   var haveSourceMap = false;
   if (flags & 8) {
    var orig = emscripten_source_map.originalPositionFor({
     line: lineno,
     column: column
    });
    haveSourceMap = orig && orig.source;
    if (haveSourceMap) {
     if (flags & 64) {
      orig.source = orig.source.substring(orig.source.replace(/\\/g, "/").lastIndexOf("/") + 1);
     }
     callstack += "    at " + cSymbolName + " (" + orig.source + ":" + orig.line + ":" + orig.column + ")\n";
    }
   }
   if (flags & 16 || !haveSourceMap) {
    if (flags & 64) {
     file = file.substring(file.replace(/\\/g, "/").lastIndexOf("/") + 1);
    }
    callstack += (haveSourceMap ? "     = " + jsSymbolName : "    at " + cSymbolName) + " (" + file + ":" + lineno + ":" + column + ")\n";
   }
   if (flags & 128 && stack_args[0]) {
    if (stack_args[1] == jsSymbolName && stack_args[2].length > 0) {
     callstack = callstack.replace(/\s+$/, "");
     callstack += " with values: " + stack_args[1] + stack_args[2] + "\n";
    }
    stack_args = __emscripten_traverse_stack(stack_args[0]);
   }
  }
  callstack = callstack.replace(/\s+$/, "");
  return callstack;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_callstack_js was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_callstack(flags, str, maxbytes) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var callstack = _emscripten_get_callstack_js(flags);
  if (!str || maxbytes <= 0) {
   return lengthBytesUTF8(callstack) + 1;
  }
  var bytesWrittenExcludingNull = stringToUTF8(callstack, str, maxbytes);
  return bytesWrittenExcludingNull + 1;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_callstack was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_canvas_size(width, height, isFullscreen) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var canvas = Module["canvas"];
  SAFE_HEAP_STORE(width | 0, canvas.width | 0, 4);
  SAFE_HEAP_STORE(height | 0, canvas.height | 0, 4);
  SAFE_HEAP_STORE(isFullscreen | 0, (Browser.isFullscreen ? 1 : 0) | 0, 4);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_canvas_size was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_compiler_setting(name) {
 var originalAsyncifyState = Asyncify.state;
 try {
  name = UTF8ToString(name);
  var ret = getCompilerSetting(name);
  if (typeof ret === "number") return ret;
  if (!_emscripten_get_compiler_setting.cache) _emscripten_get_compiler_setting.cache = {};
  var cache = _emscripten_get_compiler_setting.cache;
  var fullname = name + "__str";
  var fullret = cache[fullname];
  if (fullret) return fullret;
  return cache[fullname] = allocate(intArrayFromString(ret + ""), "i8", ALLOC_NORMAL);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_compiler_setting was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_device_pixel_ratio() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return window.devicePixelRatio || 1;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_device_pixel_ratio was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_heap_size() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return HEAP8.length;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_heap_size was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_main_loop_timing(mode, value) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (mode) SAFE_HEAP_STORE(mode | 0, Browser.mainLoop.timingMode | 0, 4);
  if (value) SAFE_HEAP_STORE(value | 0, Browser.mainLoop.timingValue | 0, 4);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_main_loop_timing was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_preloaded_image_data(path, w, h) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if ((path | 0) === path) path = UTF8ToString(path);
  path = PATH_FS.resolve(path);
  var canvas = Module["preloadedImages"][path];
  if (canvas) {
   var ctx = canvas.getContext("2d");
   var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
   var buf = _malloc(canvas.width * canvas.height * 4);
   HEAPU8.set(image.data, buf);
   SAFE_HEAP_STORE(w | 0, canvas.width | 0, 4);
   SAFE_HEAP_STORE(h | 0, canvas.height | 0, 4);
   return buf;
  }
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_preloaded_image_data was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_preloaded_image_data_from_FILE(file, w, h) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var fd = Module["_fileno"](file);
  var stream = FS.getStream(fd);
  if (stream) {
   return _emscripten_get_preloaded_image_data(stream.path, w, h);
  }
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_preloaded_image_data_from_FILE was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_get_worker_queue_size(id) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var info = Browser.workers[id];
  if (!info) return -1;
  return info.awaited;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_get_worker_queue_size was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_hide_mouse() {
 var originalAsyncifyState = Asyncify.state;
 try {
  var styleSheet = document.styleSheets[0];
  var rules = styleSheet.cssRules;
  for (var i = 0; i < rules.length; i++) {
   if (rules[i].cssText.substr(0, 6) == "canvas") {
    styleSheet.deleteRule(i);
    i--;
   }
  }
  styleSheet.insertRule("canvas.emscripten { border: 1px solid black; cursor: none; }", 0);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_hide_mouse was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

var IDBStore = {
 indexedDB: function() {
  if (typeof indexedDB !== "undefined") return indexedDB;
  var ret = null;
  if (typeof window === "object") ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
  assert(ret, "IDBStore used, but indexedDB not supported");
  return ret;
 },
 DB_VERSION: 22,
 DB_STORE_NAME: "FILE_DATA",
 dbs: {},
 blobs: [ 0 ],
 getDB: function(name, callback) {
  var db = IDBStore.dbs[name];
  if (db) {
   return callback(null, db);
  }
  var req;
  try {
   req = IDBStore.indexedDB().open(name, IDBStore.DB_VERSION);
  } catch (e) {
   return callback(e);
  }
  req.onupgradeneeded = function(e) {
   var db = e.target.result;
   var transaction = e.target.transaction;
   var fileStore;
   if (db.objectStoreNames.contains(IDBStore.DB_STORE_NAME)) {
    fileStore = transaction.objectStore(IDBStore.DB_STORE_NAME);
   } else {
    fileStore = db.createObjectStore(IDBStore.DB_STORE_NAME);
   }
  };
  req.onsuccess = function() {
   db = req.result;
   IDBStore.dbs[name] = db;
   callback(null, db);
  };
  req.onerror = function(e) {
   callback(this.error);
   e.preventDefault();
  };
 },
 getStore: function(dbName, type, callback) {
  IDBStore.getDB(dbName, function(error, db) {
   if (error) return callback(error);
   var transaction = db.transaction([ IDBStore.DB_STORE_NAME ], type);
   transaction.onerror = function(e) {
    callback(this.error || "unknown error");
    e.preventDefault();
   };
   var store = transaction.objectStore(IDBStore.DB_STORE_NAME);
   callback(null, store);
  });
 },
 getFile: function(dbName, id, callback) {
  IDBStore.getStore(dbName, "readonly", function(err, store) {
   if (err) return callback(err);
   var req = store.get(id);
   req.onsuccess = function(event) {
    var result = event.target.result;
    if (!result) {
     return callback("file " + id + " not found");
    } else {
     return callback(null, result);
    }
   };
   req.onerror = function(error) {
    callback(error);
   };
  });
 },
 setFile: function(dbName, id, data, callback) {
  IDBStore.getStore(dbName, "readwrite", function(err, store) {
   if (err) return callback(err);
   var req = store.put(data, id);
   req.onsuccess = function(event) {
    callback();
   };
   req.onerror = function(error) {
    callback(error);
   };
  });
 },
 deleteFile: function(dbName, id, callback) {
  IDBStore.getStore(dbName, "readwrite", function(err, store) {
   if (err) return callback(err);
   var req = store.delete(id);
   req.onsuccess = function(event) {
    callback();
   };
   req.onerror = function(error) {
    callback(error);
   };
  });
 },
 existsFile: function(dbName, id, callback) {
  IDBStore.getStore(dbName, "readonly", function(err, store) {
   if (err) return callback(err);
   var req = store.count(id);
   req.onsuccess = function(event) {
    callback(null, event.target.result > 0);
   };
   req.onerror = function(error) {
    callback(error);
   };
  });
 }
};

function _emscripten_idb_async_delete(db, id, arg, ondelete, onerror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  IDBStore.deleteFile(UTF8ToString(db), UTF8ToString(id), function(error) {
   if (error) {
    if (onerror) dynCall_vi(onerror, arg);
    return;
   }
   if (ondelete) dynCall_vi(ondelete, arg);
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_async_delete was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_async_exists(db, id, arg, oncheck, onerror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  IDBStore.existsFile(UTF8ToString(db), UTF8ToString(id), function(error, exists) {
   if (error) {
    if (onerror) dynCall_vi(onerror, arg);
    return;
   }
   if (oncheck) dynCall_vii(oncheck, arg, exists);
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_async_exists was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_async_load(db, id, arg, onload, onerror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  IDBStore.getFile(UTF8ToString(db), UTF8ToString(id), function(error, byteArray) {
   if (error) {
    if (onerror) dynCall_vi(onerror, arg);
    return;
   }
   var buffer = _malloc(byteArray.length);
   HEAPU8.set(byteArray, buffer);
   dynCall_viii(onload, arg, buffer, byteArray.length);
   _free(buffer);
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_async_load was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_async_store(db, id, ptr, num, arg, onstore, onerror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  IDBStore.setFile(UTF8ToString(db), UTF8ToString(id), new Uint8Array(HEAPU8.subarray(ptr, ptr + num)), function(error) {
   if (error) {
    if (onerror) dynCall_vi(onerror, arg);
    return;
   }
   if (onstore) dynCall_vi(onstore, arg);
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_async_store was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_delete(db, id, perror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Asyncify.handleSleep(function(wakeUp) {
   IDBStore.deleteFile(UTF8ToString(db), UTF8ToString(id), function(error) {
    SAFE_HEAP_STORE(perror | 0, !!error | 0, 4);
    wakeUp();
   });
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_delete was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_exists(db, id, pexists, perror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Asyncify.handleSleep(function(wakeUp) {
   IDBStore.existsFile(UTF8ToString(db), UTF8ToString(id), function(error, exists) {
    SAFE_HEAP_STORE(pexists | 0, !!exists | 0, 4);
    SAFE_HEAP_STORE(perror | 0, !!error | 0, 4);
    wakeUp();
   });
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_exists was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_free_blob(blobId) {
 var originalAsyncifyState = Asyncify.state;
 try {
  assert(IDBStore.blobs[blobId]);
  IDBStore.blobs[blobId] = null;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_free_blob was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_load(db, id, pbuffer, pnum, perror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Asyncify.handleSleep(function(wakeUp) {
   IDBStore.getFile(UTF8ToString(db), UTF8ToString(id), function(error, byteArray) {
    if (error) {
     SAFE_HEAP_STORE(perror | 0, 1 | 0, 4);
     wakeUp();
     return;
    }
    var buffer = _malloc(byteArray.length);
    HEAPU8.set(byteArray, buffer);
    SAFE_HEAP_STORE(pbuffer | 0, buffer | 0, 4);
    SAFE_HEAP_STORE(pnum | 0, byteArray.length | 0, 4);
    SAFE_HEAP_STORE(perror | 0, 0 | 0, 4);
    wakeUp();
   });
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_load was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_load_blob(db, id, pblob, perror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Asyncify.handleSleep(function(wakeUp) {
   assert(!IDBStore.pending);
   IDBStore.pending = function(msg) {
    IDBStore.pending = null;
    var blob = msg.blob;
    if (!blob) {
     SAFE_HEAP_STORE(perror | 0, 1 | 0, 4);
     wakeUp();
     return;
    }
    assert(blob instanceof Blob);
    var blobId = IDBStore.blobs.length;
    IDBStore.blobs.push(blob);
    SAFE_HEAP_STORE(pblob | 0, blobId | 0, 4);
    wakeUp();
   };
   postMessage({
    target: "IDBStore",
    method: "loadBlob",
    db: UTF8ToString(db),
    id: UTF8ToString(id)
   });
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_load_blob was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_read_from_blob(blobId, start, num, buffer) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var blob = IDBStore.blobs[blobId];
  if (!blob) return 1;
  if (start + num > blob.size) return 2;
  var byteArray = new FileReaderSync().readAsArrayBuffer(blob.slice(start, start + num));
  HEAPU8.set(new Uint8Array(byteArray), buffer);
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_read_from_blob was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_store(db, id, ptr, num, perror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Asyncify.handleSleep(function(wakeUp) {
   IDBStore.setFile(UTF8ToString(db), UTF8ToString(id), new Uint8Array(HEAPU8.subarray(ptr, ptr + num)), function(error) {
    SAFE_HEAP_STORE(perror | 0, !!error | 0, 4);
    wakeUp();
   });
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_store was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_idb_store_blob(db, id, ptr, num, perror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Asyncify.handleSleep(function(wakeUp) {
   assert(!IDBStore.pending);
   IDBStore.pending = function(msg) {
    IDBStore.pending = null;
    SAFE_HEAP_STORE(perror | 0, !!msg.error | 0, 4);
    wakeUp();
   };
   postMessage({
    target: "IDBStore",
    method: "storeBlob",
    db: UTF8ToString(db),
    id: UTF8ToString(id),
    blob: new Blob([ new Uint8Array(HEAPU8.subarray(ptr, ptr + num)) ])
   });
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_idb_store_blob was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function __reallyNegative(x) {
 var originalAsyncifyState = Asyncify.state;
 try {
  return x < 0 || x === 0 && 1 / x === -Infinity;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import _reallyNegative was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function __formatString(format, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  assert((varargs & 3) === 0);
  var textIndex = format;
  var argIndex = varargs;
  function prepVararg(ptr, type) {
   if (type === "double" || type === "i64") {
    if (ptr & 7) {
     assert((ptr & 7) === 4);
     ptr += 4;
    }
   } else {
    assert((ptr & 3) === 0);
   }
   return ptr;
  }
  function getNextArg(type) {
   var ret;
   argIndex = prepVararg(argIndex, type);
   if (type === "double") {
    ret = HEAPF64[argIndex >> 3];
    argIndex += 8;
   } else if (type == "i64") {
    ret = [ HEAP32[argIndex >> 2], HEAP32[argIndex + 4 >> 2] ];
    argIndex += 8;
   } else {
    assert((argIndex & 3) === 0);
    type = "i32";
    ret = HEAP32[argIndex >> 2];
    argIndex += 4;
   }
   return ret;
  }
  var ret = [];
  var curr, next, currArg;
  while (1) {
   var startTextIndex = textIndex;
   curr = SAFE_HEAP_LOAD(textIndex | 0, 1, 0) | 0;
   if (curr === 0) break;
   next = SAFE_HEAP_LOAD(textIndex + 1 | 0, 1, 0) | 0;
   if (curr == 37) {
    var flagAlwaysSigned = false;
    var flagLeftAlign = false;
    var flagAlternative = false;
    var flagZeroPad = false;
    var flagPadSign = false;
    flagsLoop: while (1) {
     switch (next) {
     case 43:
      flagAlwaysSigned = true;
      break;

     case 45:
      flagLeftAlign = true;
      break;

     case 35:
      flagAlternative = true;
      break;

     case 48:
      if (flagZeroPad) {
       break flagsLoop;
      } else {
       flagZeroPad = true;
       break;
      }

     case 32:
      flagPadSign = true;
      break;

     default:
      break flagsLoop;
     }
     textIndex++;
     next = SAFE_HEAP_LOAD(textIndex + 1 | 0, 1, 0) | 0;
    }
    var width = 0;
    if (next == 42) {
     width = getNextArg("i32");
     textIndex++;
     next = SAFE_HEAP_LOAD(textIndex + 1 | 0, 1, 0) | 0;
    } else {
     while (next >= 48 && next <= 57) {
      width = width * 10 + (next - 48);
      textIndex++;
      next = SAFE_HEAP_LOAD(textIndex + 1 | 0, 1, 0) | 0;
     }
    }
    var precisionSet = false, precision = -1;
    if (next == 46) {
     precision = 0;
     precisionSet = true;
     textIndex++;
     next = SAFE_HEAP_LOAD(textIndex + 1 | 0, 1, 0) | 0;
     if (next == 42) {
      precision = getNextArg("i32");
      textIndex++;
     } else {
      while (1) {
       var precisionChr = SAFE_HEAP_LOAD(textIndex + 1 | 0, 1, 0) | 0;
       if (precisionChr < 48 || precisionChr > 57) break;
       precision = precision * 10 + (precisionChr - 48);
       textIndex++;
      }
     }
     next = SAFE_HEAP_LOAD(textIndex + 1 | 0, 1, 0) | 0;
    }
    if (precision < 0) {
     precision = 6;
     precisionSet = false;
    }
    var argSize;
    switch (String.fromCharCode(next)) {
    case "h":
     var nextNext = SAFE_HEAP_LOAD(textIndex + 2 | 0, 1, 0) | 0;
     if (nextNext == 104) {
      textIndex++;
      argSize = 1;
     } else {
      argSize = 2;
     }
     break;

    case "l":
     var nextNext = SAFE_HEAP_LOAD(textIndex + 2 | 0, 1, 0) | 0;
     if (nextNext == 108) {
      textIndex++;
      argSize = 8;
     } else {
      argSize = 4;
     }
     break;

    case "L":
    case "q":
    case "j":
     argSize = 8;
     break;

    case "z":
    case "t":
    case "I":
     argSize = 4;
     break;

    default:
     argSize = null;
    }
    if (argSize) textIndex++;
    next = SAFE_HEAP_LOAD(textIndex + 1 | 0, 1, 0) | 0;
    switch (String.fromCharCode(next)) {
    case "d":
    case "i":
    case "u":
    case "o":
    case "x":
    case "X":
    case "p":
     {
      var signed = next == 100 || next == 105;
      argSize = argSize || 4;
      currArg = getNextArg("i" + argSize * 8);
      var argText;
      if (argSize == 8) {
       currArg = makeBigInt(currArg[0], currArg[1], next == 117);
      }
      if (argSize <= 4) {
       var limit = Math.pow(256, argSize) - 1;
       currArg = (signed ? reSign : unSign)(currArg & limit, argSize * 8);
      }
      var currAbsArg = Math.abs(currArg);
      var prefix = "";
      if (next == 100 || next == 105) {
       argText = reSign(currArg, 8 * argSize, 1).toString(10);
      } else if (next == 117) {
       argText = unSign(currArg, 8 * argSize, 1).toString(10);
       currArg = Math.abs(currArg);
      } else if (next == 111) {
       argText = (flagAlternative ? "0" : "") + currAbsArg.toString(8);
      } else if (next == 120 || next == 88) {
       prefix = flagAlternative && currArg != 0 ? "0x" : "";
       if (currArg < 0) {
        currArg = -currArg;
        argText = (currAbsArg - 1).toString(16);
        var buffer = [];
        for (var i = 0; i < argText.length; i++) {
         buffer.push((15 - parseInt(argText[i], 16)).toString(16));
        }
        argText = buffer.join("");
        while (argText.length < argSize * 2) argText = "f" + argText;
       } else {
        argText = currAbsArg.toString(16);
       }
       if (next == 88) {
        prefix = prefix.toUpperCase();
        argText = argText.toUpperCase();
       }
      } else if (next == 112) {
       if (currAbsArg === 0) {
        argText = "(nil)";
       } else {
        prefix = "0x";
        argText = currAbsArg.toString(16);
       }
      }
      if (precisionSet) {
       while (argText.length < precision) {
        argText = "0" + argText;
       }
      }
      if (currArg >= 0) {
       if (flagAlwaysSigned) {
        prefix = "+" + prefix;
       } else if (flagPadSign) {
        prefix = " " + prefix;
       }
      }
      if (argText.charAt(0) == "-") {
       prefix = "-" + prefix;
       argText = argText.substr(1);
      }
      while (prefix.length + argText.length < width) {
       if (flagLeftAlign) {
        argText += " ";
       } else {
        if (flagZeroPad) {
         argText = "0" + argText;
        } else {
         prefix = " " + prefix;
        }
       }
      }
      argText = prefix + argText;
      argText.split("").forEach(function(chr) {
       ret.push(chr.charCodeAt(0));
      });
      break;
     }

    case "f":
    case "F":
    case "e":
    case "E":
    case "g":
    case "G":
     {
      currArg = getNextArg("double");
      var argText;
      if (isNaN(currArg)) {
       argText = "nan";
       flagZeroPad = false;
      } else if (!isFinite(currArg)) {
       argText = (currArg < 0 ? "-" : "") + "inf";
       flagZeroPad = false;
      } else {
       var isGeneral = false;
       var effectivePrecision = Math.min(precision, 20);
       if (next == 103 || next == 71) {
        isGeneral = true;
        precision = precision || 1;
        var exponent = parseInt(currArg.toExponential(effectivePrecision).split("e")[1], 10);
        if (precision > exponent && exponent >= -4) {
         next = (next == 103 ? "f" : "F").charCodeAt(0);
         precision -= exponent + 1;
        } else {
         next = (next == 103 ? "e" : "E").charCodeAt(0);
         precision--;
        }
        effectivePrecision = Math.min(precision, 20);
       }
       if (next == 101 || next == 69) {
        argText = currArg.toExponential(effectivePrecision);
        if (/[eE][-+]\d$/.test(argText)) {
         argText = argText.slice(0, -1) + "0" + argText.slice(-1);
        }
       } else if (next == 102 || next == 70) {
        argText = currArg.toFixed(effectivePrecision);
        if (currArg === 0 && __reallyNegative(currArg)) {
         argText = "-" + argText;
        }
       }
       var parts = argText.split("e");
       if (isGeneral && !flagAlternative) {
        while (parts[0].length > 1 && parts[0].indexOf(".") != -1 && (parts[0].slice(-1) == "0" || parts[0].slice(-1) == ".")) {
         parts[0] = parts[0].slice(0, -1);
        }
       } else {
        if (flagAlternative && argText.indexOf(".") == -1) parts[0] += ".";
        while (precision > effectivePrecision++) parts[0] += "0";
       }
       argText = parts[0] + (parts.length > 1 ? "e" + parts[1] : "");
       if (next == 69) argText = argText.toUpperCase();
       if (currArg >= 0) {
        if (flagAlwaysSigned) {
         argText = "+" + argText;
        } else if (flagPadSign) {
         argText = " " + argText;
        }
       }
      }
      while (argText.length < width) {
       if (flagLeftAlign) {
        argText += " ";
       } else {
        if (flagZeroPad && (argText[0] == "-" || argText[0] == "+")) {
         argText = argText[0] + "0" + argText.slice(1);
        } else {
         argText = (flagZeroPad ? "0" : " ") + argText;
        }
       }
      }
      if (next < 97) argText = argText.toUpperCase();
      argText.split("").forEach(function(chr) {
       ret.push(chr.charCodeAt(0));
      });
      break;
     }

    case "s":
     {
      var arg = getNextArg("i8*");
      var argLength = arg ? _strlen(arg) : "(null)".length;
      if (precisionSet) argLength = Math.min(argLength, precision);
      if (!flagLeftAlign) {
       while (argLength < width--) {
        ret.push(32);
       }
      }
      if (arg) {
       for (var i = 0; i < argLength; i++) {
        ret.push(SAFE_HEAP_LOAD(arg++ | 0, 1, 1) | 0);
       }
      } else {
       ret = ret.concat(intArrayFromString("(null)".substr(0, argLength), true));
      }
      if (flagLeftAlign) {
       while (argLength < width--) {
        ret.push(32);
       }
      }
      break;
     }

    case "c":
     {
      if (flagLeftAlign) ret.push(getNextArg("i8"));
      while (--width > 0) {
       ret.push(32);
      }
      if (!flagLeftAlign) ret.push(getNextArg("i8"));
      break;
     }

    case "n":
     {
      var ptr = getNextArg("i32*");
      SAFE_HEAP_STORE(ptr | 0, ret.length | 0, 4);
      break;
     }

    case "%":
     {
      ret.push(curr);
      break;
     }

    default:
     {
      for (var i = startTextIndex; i < textIndex + 2; i++) {
       ret.push(SAFE_HEAP_LOAD(i | 0, 1, 0) | 0);
      }
     }
    }
    textIndex += 2;
   } else {
    ret.push(curr);
    textIndex += 1;
   }
  }
  return ret;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import _formatString was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_log_js(flags, str) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (flags & 24) {
   str = str.replace(/\s+$/, "");
   str += (str.length > 0 ? "\n" : "") + _emscripten_get_callstack_js(flags);
  }
  if (flags & 1) {
   if (flags & 4) {
    console.error(str);
   } else if (flags & 2) {
    console.warn(str);
   } else {
    console.log(str);
   }
  } else if (flags & 6) {
   err(str);
  } else {
   out(str);
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_log_js was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_log(flags, varargs) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var format = HEAP32[varargs >> 2];
  varargs += 4;
  var str = "";
  if (format) {
   var result = __formatString(format, varargs);
   for (var i = 0; i < result.length; ++i) {
    str += String.fromCharCode(result[i]);
   }
  }
  _emscripten_log_js(flags, str);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_log was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

var setjmpId = 0;

function _saveSetjmp(env, label, table, size) {
 var originalAsyncifyState = Asyncify.state;
 try {
  env = env | 0;
  label = label | 0;
  table = table | 0;
  size = size | 0;
  var i = 0;
  setjmpId = setjmpId + 1 | 0;
  SAFE_HEAP_STORE(env | 0, setjmpId | 0, 4);
  while ((i | 0) < (size | 0)) {
   if ((SAFE_HEAP_LOAD(table + (i << 3) | 0, 4, 0) | 0) == 0) {
    SAFE_HEAP_STORE(table + (i << 3) | 0, setjmpId | 0, 4);
    SAFE_HEAP_STORE(table + ((i << 3) + 4) | 0, label | 0, 4);
    SAFE_HEAP_STORE(table + ((i << 3) + 8) | 0, 0 | 0, 4);
    setTempRet0(size | 0);
    return table | 0;
   }
   i = i + 1 | 0;
  }
  size = size * 2 | 0;
  table = _realloc(table | 0, 8 * (size + 1 | 0) | 0) | 0;
  table = _saveSetjmp(env | 0, label | 0, table | 0, size | 0) | 0;
  setTempRet0(size | 0);
  return table | 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import saveSetjmp was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _testSetjmp(id, table, size) {
 var originalAsyncifyState = Asyncify.state;
 try {
  id = id | 0;
  table = table | 0;
  size = size | 0;
  var i = 0, curr = 0;
  while ((i | 0) < (size | 0)) {
   curr = SAFE_HEAP_LOAD(table + (i << 3) | 0, 4, 0) | 0;
   if ((curr | 0) == 0) break;
   if ((curr | 0) == (id | 0)) {
    return SAFE_HEAP_LOAD(table + ((i << 3) + 4) | 0, 4, 0) | 0;
   }
   i = i + 1 | 0;
  }
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import testSetjmp was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _longjmp(env, value) {
 var originalAsyncifyState = Asyncify.state;
 try {
  _setThrew(env, value || 1);
  throw "longjmp";
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import longjmp was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_longjmp(env, value) {
 var originalAsyncifyState = Asyncify.state;
 try {
  _longjmp(env, value);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_longjmp was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_memcpy_big(dest, src, num) {
 var originalAsyncifyState = Asyncify.state;
 try {
  HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_memcpy_big was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_pause_main_loop() {
 var originalAsyncifyState = Asyncify.state;
 try {
  Browser.mainLoop.pause();
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_pause_main_loop was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_print_double(x, to, max) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var str = x + "";
  if (to) return stringToUTF8(str, to, max); else return lengthBytesUTF8(str);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_print_double was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_random() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return Math.random();
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_random was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_resume_main_loop() {
 var originalAsyncifyState = Asyncify.state;
 try {
  Browser.mainLoop.resume();
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_resume_main_loop was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_run_preload_plugins(file, onload, onerror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = true;
  var _file = UTF8ToString(file);
  var data = FS.analyzePath(_file);
  if (!data.exists) return -1;
  FS.createPreloadedFile(PATH.dirname(_file), PATH.basename(_file), new Uint8Array(data.object.contents), true, true, function() {
   if (onload) dynCall_vi(onload, file);
  }, function() {
   if (onerror) dynCall_vi(onerror, file);
  }, true);
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_run_preload_plugins was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_run_preload_plugins_data(data, size, suffix, arg, onload, onerror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Module["noExitRuntime"] = true;
  var _suffix = UTF8ToString(suffix);
  if (!Browser.asyncPrepareDataCounter) Browser.asyncPrepareDataCounter = 0;
  var name = "prepare_data_" + Browser.asyncPrepareDataCounter++ + "." + _suffix;
  var lengthAsUTF8 = lengthBytesUTF8(name);
  var cname = _malloc(lengthAsUTF8 + 1);
  stringToUTF8(name, cname, lengthAsUTF8 + 1);
  FS.createPreloadedFile("/", name, HEAPU8.subarray(data, data + size), true, true, function() {
   if (onload) dynCall_vii(onload, arg, cname);
  }, function() {
   if (onerror) dynCall_vi(onerror, arg);
  }, true);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_run_preload_plugins_data was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_run_script_int(ptr) {
 var originalAsyncifyState = Asyncify.state;
 try {
  return eval(UTF8ToString(ptr)) | 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_run_script_int was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_run_script_string(ptr) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var s = eval(UTF8ToString(ptr));
  if (s == null) {
   return 0;
  }
  s += "";
  var me = _emscripten_run_script_string;
  var len = lengthBytesUTF8(s);
  if (!me.bufferSize || me.bufferSize < len + 1) {
   if (me.bufferSize) _free(me.buffer);
   me.bufferSize = len + 1;
   me.buffer = _malloc(me.bufferSize);
  }
  stringToUTF8(s, me.buffer, me.bufferSize);
  return me.buffer;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_run_script_string was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_canvas_size(width, height) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Browser.setCanvasSize(width, height);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_canvas_size was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_main_loop_arg(func, arg, fps, simulateInfiniteLoop) {
 var originalAsyncifyState = Asyncify.state;
 try {
  _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_main_loop_arg was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_main_loop_expected_blockers(num) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Browser.mainLoop.expectedBlockers = num;
  Browser.mainLoop.remainingBlockers = num;
  Browser.mainLoop.updateStatus();
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_main_loop_expected_blockers was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function ___set_network_callback(event, userData, callback) {
 var originalAsyncifyState = Asyncify.state;
 try {
  function _callback(data) {
   try {
    if (event === "error") {
     var sp = stackSave();
     var msg = allocate(intArrayFromString(data[2]), "i8", ALLOC_STACK);
     dynCall_viiii(callback, data[0], data[1], msg, userData);
     stackRestore(sp);
    } else {
     dynCall_vii(callback, data, userData);
    }
   } catch (e) {
    if (e instanceof ExitStatus) {
     return;
    } else {
     if (e && typeof e === "object" && e.stack) err("exception thrown: " + [ e, e.stack ]);
     throw e;
    }
   }
  }
  Module["noExitRuntime"] = true;
  Module["websocket"]["on"](event, callback ? _callback : null);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import __set_network_callback was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_socket_close_callback(userData, callback) {
 var originalAsyncifyState = Asyncify.state;
 try {
  ___set_network_callback("close", userData, callback);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_socket_close_callback was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_socket_connection_callback(userData, callback) {
 var originalAsyncifyState = Asyncify.state;
 try {
  ___set_network_callback("connection", userData, callback);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_socket_connection_callback was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_socket_error_callback(userData, callback) {
 var originalAsyncifyState = Asyncify.state;
 try {
  ___set_network_callback("error", userData, callback);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_socket_error_callback was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_socket_listen_callback(userData, callback) {
 var originalAsyncifyState = Asyncify.state;
 try {
  ___set_network_callback("listen", userData, callback);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_socket_listen_callback was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_socket_message_callback(userData, callback) {
 var originalAsyncifyState = Asyncify.state;
 try {
  ___set_network_callback("message", userData, callback);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_socket_message_callback was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_set_socket_open_callback(userData, callback) {
 var originalAsyncifyState = Asyncify.state;
 try {
  ___set_network_callback("open", userData, callback);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_set_socket_open_callback was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_sleep(ms) {
 Asyncify.handleSleep(function(wakeUp) {
  Browser.safeSetTimeout(wakeUp, ms);
 });
}

function _emscripten_sleep_with_yield() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: emscripten_sleep_with_yield");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_sleep_with_yield was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_wget(url, file) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Asyncify.handleSleep(function(wakeUp) {
   var _url = UTF8ToString(url);
   var _file = UTF8ToString(file);
   _file = PATH_FS.resolve(FS.cwd(), _file);
   var destinationDirectory = PATH.dirname(_file);
   FS.createPreloadedFile(destinationDirectory, PATH.basename(_file), _url, true, true, wakeUp, wakeUp, undefined, undefined, function() {
    FS.mkdirTree(destinationDirectory);
   });
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_wget was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_wget_data(url, pbuffer, pnum, perror) {
 var originalAsyncifyState = Asyncify.state;
 try {
  Asyncify.handleSleep(function(wakeUp) {
   Browser.asyncLoad(UTF8ToString(url), function(byteArray) {
    var buffer = _malloc(byteArray.length);
    HEAPU8.set(byteArray, buffer);
    SAFE_HEAP_STORE(pbuffer | 0, buffer | 0, 4);
    SAFE_HEAP_STORE(pnum | 0, byteArray.length | 0, 4);
    SAFE_HEAP_STORE(perror | 0, 0 | 0, 4);
    wakeUp();
   }, function() {
    SAFE_HEAP_STORE(perror | 0, 1 | 0, 4);
    wakeUp();
   }, true);
  });
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_wget_data was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_worker_respond(data, size) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (workerResponded) throw "already responded with final response!";
  workerResponded = true;
  var transferObject = {
   "callbackId": workerCallbackId,
   "finalResponse": true,
   "data": data ? new Uint8Array(HEAPU8.subarray(data, data + size)) : 0
  };
  if (data) {
   postMessage(transferObject, [ transferObject.data.buffer ]);
  } else {
   postMessage(transferObject);
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_worker_respond was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_worker_respond_provisionally(data, size) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (workerResponded) throw "already responded with final response!";
  var transferObject = {
   "callbackId": workerCallbackId,
   "finalResponse": false,
   "data": data ? new Uint8Array(HEAPU8.subarray(data, data + size)) : 0
  };
  if (data) {
   postMessage(transferObject, [ transferObject.data.buffer ]);
  } else {
   postMessage(transferObject);
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_worker_respond_provisionally was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_yield() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: emscripten_yield");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_yield was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _exit(status) {
 var originalAsyncifyState = Asyncify.state;
 try {
  exit(status);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import exit was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

var _fabs = Math_abs;

var _fabsf = Math_abs;

function _fill_array_close1_open2() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: fill_array_close1_open2");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import fill_array_close1_open2 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _fill_array_close_open() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: fill_array_close_open");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import fill_array_close_open was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _fill_array_open_close() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: fill_array_open_close");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import fill_array_open_close was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _fill_array_open_open() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: fill_array_open_open");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import fill_array_open_open was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _genrand_close1_open2() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: genrand_close1_open2");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import genrand_close1_open2 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _genrand_close_open() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: genrand_close_open");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import genrand_close_open was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _genrand_open_close() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: genrand_open_close");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import genrand_open_close was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _genrand_open_open() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: genrand_open_open");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import genrand_open_open was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _getTempRet0() {
 var originalAsyncifyState = Asyncify.state;
 try {
  return getTempRet0() | 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import getTempRet0 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _get_idstring() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: get_idstring");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import get_idstring was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _get_min_array_size() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: get_min_array_size");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import get_min_array_size was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _getenv(name) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (name === 0) return 0;
  name = UTF8ToString(name);
  if (!ENV.hasOwnProperty(name)) return 0;
  if (_getenv.ret) _free(_getenv.ret);
  _getenv.ret = allocateUTF8(ENV[name]);
  return _getenv.ret;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import getenv was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _gettimeofday(ptr) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var now = Date.now();
  SAFE_HEAP_STORE(ptr | 0, now / 1e3 | 0 | 0, 4);
  SAFE_HEAP_STORE(ptr + 4 | 0, now % 1e3 * 1e3 | 0 | 0, 4);
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import gettimeofday was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _init_by_array() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: init_by_array");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import init_by_array was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _init_gen_rand() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: init_gen_rand");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import init_gen_rand was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _jl_apply_2va() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: jl_apply_2va");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import jl_apply_2va was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _jl_deserialize_verify_header() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: jl_deserialize_verify_header");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import jl_deserialize_verify_header was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _jl_dump_fptr_asm() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: jl_dump_fptr_asm");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import jl_dump_fptr_asm was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _jl_gc_use() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: jl_gc_use");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import jl_gc_use was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _jl_set_fiber(ctx) {
 set_next_ctx(ctx, false);
 return ctx_switch(0);
}

function _jl_start_fiber(lastt_ctx, ctx) {
 set_next_ctx(ctx, true);
 return ctx_switch(lastt_ctx);
}

function _jl_swap_fiber(lastt_ctx, ctx) {
 set_next_ctx(ctx, false);
 return ctx_switch(lastt_ctx);
}

function _jl_threading_profile() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: jl_threading_profile");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import jl_threading_profile was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_code_copy_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_code_copy_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_code_copy_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_code_copy_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_code_copy_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_code_copy_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_code_copy_with_tables_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_code_copy_with_tables_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_code_copy_with_tables_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_code_copy_with_tables_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_code_copy_with_tables_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_code_copy_with_tables_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_code_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_code_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_code_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_code_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_code_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_code_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_compile_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_compile_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_compile_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_compile_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_compile_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_compile_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_compile_context_copy_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_compile_context_copy_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_compile_context_copy_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_compile_context_copy_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_compile_context_copy_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_compile_context_copy_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_compile_context_create_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_compile_context_create_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_compile_context_create_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_compile_context_create_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_compile_context_create_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_compile_context_create_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_compile_context_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_compile_context_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_compile_context_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_compile_context_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_compile_context_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_compile_context_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_config_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_config_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_config_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_config_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_config_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_config_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_convert_context_copy_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_convert_context_copy_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_convert_context_copy_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_convert_context_copy_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_convert_context_copy_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_convert_context_copy_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_convert_context_create_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_convert_context_create_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_convert_context_create_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_convert_context_create_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_convert_context_create_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_convert_context_create_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_convert_context_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_convert_context_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_convert_context_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_convert_context_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_convert_context_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_convert_context_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_converted_pattern_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_converted_pattern_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_converted_pattern_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_converted_pattern_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_converted_pattern_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_converted_pattern_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_dfa_match_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_dfa_match_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_dfa_match_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_dfa_match_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_dfa_match_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_dfa_match_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_general_context_copy_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_general_context_copy_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_general_context_copy_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_general_context_copy_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_general_context_copy_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_general_context_copy_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_general_context_create_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_general_context_create_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_general_context_create_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_general_context_create_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_general_context_create_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_general_context_create_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_general_context_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_general_context_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_general_context_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_general_context_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_general_context_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_general_context_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_error_message_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_error_message_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_error_message_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_error_message_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_error_message_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_error_message_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_mark_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_mark_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_mark_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_mark_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_mark_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_mark_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_ovector_count_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_ovector_count_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_ovector_count_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_ovector_count_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_ovector_count_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_ovector_count_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_ovector_pointer_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_ovector_pointer_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_ovector_pointer_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_ovector_pointer_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_ovector_pointer_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_ovector_pointer_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_startchar_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_startchar_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_startchar_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_get_startchar_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_get_startchar_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_get_startchar_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_compile_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_compile_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_compile_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_compile_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_compile_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_compile_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_free_unused_memory_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_free_unused_memory_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_free_unused_memory_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_free_unused_memory_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_free_unused_memory_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_free_unused_memory_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_match_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_match_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_match_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_match_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_match_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_match_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_stack_assign_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_stack_assign_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_stack_assign_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_stack_assign_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_stack_assign_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_stack_assign_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_stack_create_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_stack_create_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_stack_create_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_stack_create_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_stack_create_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_stack_create_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_stack_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_stack_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_stack_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_jit_stack_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_jit_stack_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_jit_stack_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_maketables_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_maketables_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_maketables_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_maketables_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_maketables_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_maketables_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_context_copy_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_context_copy_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_context_copy_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_context_copy_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_context_copy_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_context_copy_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_context_create_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_context_create_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_context_create_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_context_create_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_context_create_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_context_create_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_context_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_context_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_context_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_context_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_context_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_context_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_data_create_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_data_create_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_data_create_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_data_create_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_data_create_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_data_create_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_data_create_from_pattern_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_data_create_from_pattern_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_data_create_from_pattern_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_data_create_from_pattern_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_data_create_from_pattern_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_data_create_from_pattern_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_data_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_data_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_data_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_match_data_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_match_data_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_match_data_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_pattern_convert_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_pattern_convert_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_pattern_convert_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_pattern_convert_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_pattern_convert_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_pattern_convert_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_pattern_info_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_pattern_info_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_pattern_info_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_pattern_info_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_pattern_info_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_pattern_info_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_serialize_decode_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_serialize_decode_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_serialize_decode_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_serialize_decode_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_serialize_decode_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_serialize_decode_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_serialize_encode_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_serialize_encode_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_serialize_encode_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_serialize_encode_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_serialize_encode_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_serialize_encode_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_serialize_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_serialize_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_serialize_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_serialize_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_serialize_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_serialize_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_serialize_get_number_of_codes_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_serialize_get_number_of_codes_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_serialize_get_number_of_codes_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_serialize_get_number_of_codes_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_serialize_get_number_of_codes_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_serialize_get_number_of_codes_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_bsr_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_bsr_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_bsr_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_bsr_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_bsr_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_bsr_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_character_tables_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_character_tables_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_character_tables_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_character_tables_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_character_tables_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_character_tables_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_compile_extra_options_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_compile_extra_options_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_compile_extra_options_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_compile_extra_options_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_compile_extra_options_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_compile_extra_options_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_compile_recursion_guard_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_compile_recursion_guard_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_compile_recursion_guard_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_compile_recursion_guard_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_compile_recursion_guard_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_compile_recursion_guard_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_depth_limit_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_depth_limit_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_depth_limit_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_depth_limit_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_depth_limit_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_depth_limit_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_glob_escape_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_glob_escape_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_glob_escape_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_glob_escape_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_glob_escape_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_glob_escape_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_glob_separator_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_glob_separator_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_glob_separator_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_glob_separator_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_glob_separator_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_glob_separator_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_heap_limit_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_heap_limit_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_heap_limit_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_heap_limit_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_heap_limit_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_heap_limit_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_match_limit_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_match_limit_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_match_limit_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_match_limit_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_match_limit_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_match_limit_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_max_pattern_length_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_max_pattern_length_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_max_pattern_length_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_max_pattern_length_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_max_pattern_length_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_max_pattern_length_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_newline_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_newline_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_newline_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_newline_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_newline_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_newline_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_offset_limit_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_offset_limit_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_offset_limit_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_offset_limit_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_offset_limit_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_offset_limit_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_parens_nest_limit_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_parens_nest_limit_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_parens_nest_limit_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_parens_nest_limit_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_parens_nest_limit_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_parens_nest_limit_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_recursion_limit_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_recursion_limit_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_recursion_limit_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_recursion_limit_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_recursion_limit_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_recursion_limit_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_recursion_memory_management_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_recursion_memory_management_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_recursion_memory_management_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_set_recursion_memory_management_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_set_recursion_memory_management_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_set_recursion_memory_management_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substitute_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substitute_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substitute_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substitute_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substitute_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substitute_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_copy_byname_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_copy_byname_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_copy_byname_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_copy_byname_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_copy_byname_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_copy_byname_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_copy_bynumber_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_copy_bynumber_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_copy_bynumber_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_copy_bynumber_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_copy_bynumber_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_copy_bynumber_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_get_byname_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_get_byname_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_get_byname_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_get_byname_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_get_byname_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_get_byname_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_get_bynumber_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_get_bynumber_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_get_bynumber_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_get_bynumber_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_get_bynumber_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_get_bynumber_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_length_byname_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_length_byname_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_length_byname_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_length_byname_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_length_byname_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_length_byname_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_length_bynumber_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_length_bynumber_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_length_bynumber_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_length_bynumber_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_length_bynumber_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_length_bynumber_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_list_free_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_list_free_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_list_free_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_list_free_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_list_free_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_list_free_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_list_get_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_list_get_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_list_get_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_list_get_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_list_get_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_list_get_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_nametable_scan_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_nametable_scan_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_nametable_scan_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_nametable_scan_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_nametable_scan_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_nametable_scan_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_number_from_name_16() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_number_from_name_16");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_number_from_name_16 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _pcre2_substring_number_from_name_32() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: pcre2_substring_number_from_name_32");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import pcre2_substring_number_from_name_32 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _raise(sig) {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("Calling stub instead of raise()");
  ___setErrNo(ERRNO_CODES.ENOSYS);
  warnOnce("raise() returning an error as we do not support it");
  return -1;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import raise was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function abortOnCannotGrowMemory(requestedSize) {
 var originalAsyncifyState = Asyncify.state;
 try {
  abort("Cannot enlarge memory arrays to size " + requestedSize + " bytes (OOM). Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value " + HEAP8.length + ", (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ");
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import $abortOnCannotGrowMemory was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function emscripten_realloc_buffer(size) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var PAGE_MULTIPLE = 65536;
  size = alignUp(size, PAGE_MULTIPLE);
  var oldSize = buffer.byteLength;
  try {
   var result = wasmMemory.grow((size - oldSize) / 65536);
   if (result !== (-1 | 0)) {
    buffer = wasmMemory.buffer;
    return true;
   } else {
    return false;
   }
  } catch (e) {
   console.error("emscripten_realloc_buffer: Attempted to grow from " + oldSize + " bytes to " + size + " bytes, but got error: " + e);
   return false;
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import $emscripten_realloc_buffer was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _emscripten_resize_heap(requestedSize) {
 var originalAsyncifyState = Asyncify.state;
 try {
  var oldSize = _emscripten_get_heap_size();
  assert(requestedSize > oldSize);
  var PAGE_MULTIPLE = 65536;
  var LIMIT = 2147483648 - PAGE_MULTIPLE;
  if (requestedSize > LIMIT) {
   err("Cannot enlarge memory, asked to go up to " + requestedSize + " bytes, but the limit is " + LIMIT + " bytes!");
   return false;
  }
  var MIN_TOTAL_MEMORY = 16777216;
  var newSize = Math.max(oldSize, MIN_TOTAL_MEMORY);
  while (newSize < requestedSize) {
   if (newSize <= 536870912) {
    newSize = alignUp(2 * newSize, PAGE_MULTIPLE);
   } else {
    newSize = Math.min(alignUp((3 * newSize + 2147483648) / 4, PAGE_MULTIPLE), LIMIT);
   }
   if (newSize === oldSize) {
    warnOnce("Cannot ask for more memory since we reached the practical limit in browsers (which is just below 2GB), so the request would have failed. Requesting only " + HEAP8.length);
   }
  }
  var start = Date.now();
  if (!emscripten_realloc_buffer(newSize)) {
   err("Failed to grow the heap from " + oldSize + " bytes to " + newSize + " bytes, not enough memory!");
   return false;
  }
  updateGlobalBufferViews();
  return true;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import emscripten_resize_heap was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _sbrk(increment) {
 var originalAsyncifyState = Asyncify.state;
 try {
  increment = increment | 0;
  var oldDynamicTop = 0;
  var newDynamicTop = 0;
  var totalMemory = 0;
  totalMemory = _emscripten_get_heap_size() | 0;
  oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0;
  newDynamicTop = oldDynamicTop + increment | 0;
  if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
   abortOnCannotGrowMemory(newDynamicTop | 0) | 0;
   ___setErrNo(12);
   return -1;
  }
  if ((newDynamicTop | 0) > (totalMemory | 0)) {
   if (_emscripten_resize_heap(newDynamicTop | 0) | 0) {} else {
    ___setErrNo(12);
    return -1;
   }
  }
  HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop | 0;
  return oldDynamicTop | 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import sbrk was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _setTempRet0($i) {
 var originalAsyncifyState = Asyncify.state;
 try {
  setTempRet0($i | 0);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import setTempRet0 was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _setenv(envname, envval, overwrite) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (envname === 0) {
   ___setErrNo(22);
   return -1;
  }
  var name = UTF8ToString(envname);
  var val = UTF8ToString(envval);
  if (name === "" || name.indexOf("=") !== -1) {
   ___setErrNo(22);
   return -1;
  }
  if (ENV.hasOwnProperty(name) && !overwrite) return 0;
  ENV[name] = val;
  ___buildEnvironment(__get_environ());
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import setenv was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _sigfillset(set) {
 var originalAsyncifyState = Asyncify.state;
 try {
  SAFE_HEAP_STORE(set | 0, -1 >>> 0 | 0, 4);
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import sigfillset was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _siglongjmp(env, value) {
 var originalAsyncifyState = Asyncify.state;
 try {
  warnOnce("Calling longjmp() instead of siglongjmp()");
  _longjmp(env, value);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import siglongjmp was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _sigprocmask() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("Calling stub instead of sigprocmask()");
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import sigprocmask was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

var _sqrt = Math_sqrt;

var _sqrtf = Math_sqrt;

function _sysconf(name) {
 var originalAsyncifyState = Asyncify.state;
 try {
  switch (name) {
  case 30:
   return PAGE_SIZE;

  case 85:
   var maxHeapSize = 2 * 1024 * 1024 * 1024 - 65536;
   return maxHeapSize / PAGE_SIZE;

  case 132:
  case 133:
  case 12:
  case 137:
  case 138:
  case 15:
  case 235:
  case 16:
  case 17:
  case 18:
  case 19:
  case 20:
  case 149:
  case 13:
  case 10:
  case 236:
  case 153:
  case 9:
  case 21:
  case 22:
  case 159:
  case 154:
  case 14:
  case 77:
  case 78:
  case 139:
  case 80:
  case 81:
  case 82:
  case 68:
  case 67:
  case 164:
  case 11:
  case 29:
  case 47:
  case 48:
  case 95:
  case 52:
  case 51:
  case 46:
   return 200809;

  case 79:
   return 0;

  case 27:
  case 246:
  case 127:
  case 128:
  case 23:
  case 24:
  case 160:
  case 161:
  case 181:
  case 182:
  case 242:
  case 183:
  case 184:
  case 243:
  case 244:
  case 245:
  case 165:
  case 178:
  case 179:
  case 49:
  case 50:
  case 168:
  case 169:
  case 175:
  case 170:
  case 171:
  case 172:
  case 97:
  case 76:
  case 32:
  case 173:
  case 35:
   return -1;

  case 176:
  case 177:
  case 7:
  case 155:
  case 8:
  case 157:
  case 125:
  case 126:
  case 92:
  case 93:
  case 129:
  case 130:
  case 131:
  case 94:
  case 91:
   return 1;

  case 74:
  case 60:
  case 69:
  case 70:
  case 4:
   return 1024;

  case 31:
  case 42:
  case 72:
   return 32;

  case 87:
  case 26:
  case 33:
   return 2147483647;

  case 34:
  case 1:
   return 47839;

  case 38:
  case 36:
   return 99;

  case 43:
  case 37:
   return 2048;

  case 0:
   return 2097152;

  case 3:
   return 65536;

  case 28:
   return 32768;

  case 44:
   return 32767;

  case 75:
   return 16384;

  case 39:
   return 1e3;

  case 89:
   return 700;

  case 71:
   return 256;

  case 40:
   return 255;

  case 2:
   return 100;

  case 180:
   return 64;

  case 25:
   return 20;

  case 5:
   return 16;

  case 6:
   return 6;

  case 73:
   return 4;

  case 84:
   {
    if (typeof navigator === "object") return navigator["hardwareConcurrency"] || 1;
    return 1;
   }
  }
  ___setErrNo(22);
  return -1;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import sysconf was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _timer_create() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: timer_create");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import timer_create was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _timer_delete() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: timer_delete");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import timer_delete was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _timer_settime() {
 var originalAsyncifyState = Asyncify.state;
 try {
  err("missing function: timer_settime");
  abort(-1);
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import timer_settime was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function _unsetenv(name) {
 var originalAsyncifyState = Asyncify.state;
 try {
  if (name === 0) {
   ___setErrNo(22);
   return -1;
  }
  name = UTF8ToString(name);
  if (name === "" || name.indexOf("=") !== -1) {
   ___setErrNo(22);
   return -1;
  }
  if (ENV.hasOwnProperty(name)) {
   delete ENV[name];
   ___buildEnvironment(__get_environ());
  }
  return 0;
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import unsetenv was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

function runAndAbortIfError(func) {
 var originalAsyncifyState = Asyncify.state;
 try {
  try {
   return func();
  } catch (e) {
   abort(e);
  }
 } finally {
  if (Asyncify.state !== originalAsyncifyState) throw "import $runAndAbortIfError was not in ASYNCIFY_IMPORTS, but changed the state";
 }
}

var Asyncify = {
 State: {
  Normal: 0,
  Unwinding: 1,
  Rewinding: 2
 },
 state: 0,
 StackSize: 4096,
 currData: null,
 dataInfo: {},
 returnValue: 0,
 exportCallStack: [],
 instrumentWasmExports: function(exports) {
  var ret = {};
  for (var x in exports) {
   (function(x) {
    var original = exports[x];
    if (typeof original === "function") {
     ret[x] = function() {
      Asyncify.exportCallStack.push(x);
      try {
       return original.apply(null, arguments);
      } finally {
       if (ABORT) return;
       var y = Asyncify.exportCallStack.pop(x);
       assert(y === x);
       if (Asyncify.currData && Asyncify.state === Asyncify.State.Unwinding && Asyncify.exportCallStack.length === 0) {
        Asyncify.state = Asyncify.State.Normal;
        runAndAbortIfError(Module["_asyncify_stop_unwind"]);
       }
      }
     };
    } else {
     ret[x] = original;
    }
   })(x);
  }
  return ret;
 },
 allocateData: function() {
  var ptr = _malloc(Asyncify.StackSize + 8);
  HEAP32[ptr >> 2] = ptr + 8;
  HEAP32[ptr + 4 >> 2] = ptr + 8 + Asyncify.StackSize;
  var bottomOfCallStack = Asyncify.exportCallStack[0];
  Asyncify.dataInfo[ptr] = {
   bottomOfCallStack: bottomOfCallStack
  };
  return ptr;
 },
 freeData: function(ptr) {
  _free(ptr);
  Asyncify.dataInfo[ptr] = null;
 },
 handleSleep: function(startAsync) {
  if (ABORT) return;
  Module["noExitRuntime"] = true;
  if (Asyncify.state === Asyncify.State.Normal) {
   var reachedCallback = false;
   var reachedAfterCallback = false;
   startAsync(function(returnValue) {
    assert(!returnValue || typeof returnValue === "number");
    if (ABORT) return;
    Asyncify.returnValue = returnValue || 0;
    reachedCallback = true;
    if (!reachedAfterCallback) {
     return;
    }
    Asyncify.state = Asyncify.State.Rewinding;
    runAndAbortIfError(function() {
     Module["_asyncify_start_rewind"](Asyncify.currData);
    });
    if (Browser.mainLoop.func) {
     Browser.mainLoop.resume();
    }
    var start = Asyncify.dataInfo[Asyncify.currData].bottomOfCallStack;
    Module["asm"][start]();
   });
   reachedAfterCallback = true;
   if (!reachedCallback) {
    Asyncify.state = Asyncify.State.Unwinding;
    Asyncify.currData = Asyncify.allocateData();
    runAndAbortIfError(function() {
     Module["_asyncify_start_unwind"](Asyncify.currData);
    });
    if (Browser.mainLoop.func) {
     Browser.mainLoop.pause();
    }
   }
  } else if (Asyncify.state === Asyncify.State.Rewinding) {
   Asyncify.state = Asyncify.State.Normal;
   runAndAbortIfError(Module["_asyncify_stop_rewind"]);
   Asyncify.freeData(Asyncify.currData);
   Asyncify.currData = null;
  } else {
   abort("invalid state: " + Asyncify.state);
  }
  return Asyncify.returnValue;
 }
};

if (ENVIRONMENT_IS_NODE) {
 _emscripten_get_now = function _emscripten_get_now_actual() {
  var t = process["hrtime"]();
  return t[0] * 1e3 + t[1] / 1e6;
 };
} else if (typeof dateNow !== "undefined") {
 _emscripten_get_now = dateNow;
} else if (typeof performance === "object" && performance && typeof performance["now"] === "function") {
 _emscripten_get_now = function() {
  return performance["now"]();
 };
} else {
 _emscripten_get_now = Date.now;
}

FS.staticInit();

if (ENVIRONMENT_HAS_NODE) {
 var fs = require("fs");
 var NODEJS_PATH = require("path");
 NODEFS.staticInit();
}

Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas, vrDevice) {
 err("Module.requestFullScreen is deprecated. Please call Module.requestFullscreen instead.");
 Module["requestFullScreen"] = Module["requestFullscreen"];
 Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice);
};

Module["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas, vrDevice) {
 Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
};

Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) {
 Browser.requestAnimationFrame(func);
};

Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) {
 Browser.setCanvasSize(width, height, noUpdates);
};

Module["pauseMainLoop"] = function Module_pauseMainLoop() {
 Browser.mainLoop.pause();
};

Module["resumeMainLoop"] = function Module_resumeMainLoop() {
 Browser.mainLoop.resume();
};

Module["getUserMedia"] = function Module_getUserMedia() {
 Browser.getUserMedia();
};

Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) {
 return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes);
};

function intArrayFromString(stringy, dontAddNull, length) {
 var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
 var u8array = new Array(len);
 var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
 if (dontAddNull) u8array.length = numBytesWritten;
 return u8array;
}

var asmGlobalArg = {};

var asmLibraryArg = {
 "a": DYNAMICTOP_PTR,
 "g": ___assert_fail,
 "af": ___buildEnvironment,
 "$e": ___clock_gettime,
 "x": ___cxa_atexit,
 "_e": ___cxa_pure_virtual,
 "L": ___lock,
 "Ze": ___map_file,
 "Ye": ___syscall10,
 "Xe": ___syscall12,
 "We": ___syscall122,
 "Ve": ___syscall125,
 "ae": ___syscall140,
 "Ue": ___syscall142,
 "Te": ___syscall145,
 "$d": ___syscall146,
 "Se": ___syscall181,
 "Re": ___syscall183,
 "Qe": ___syscall191,
 "Pe": ___syscall192,
 "Oe": ___syscall194,
 "_d": ___syscall195,
 "Ne": ___syscall196,
 "Me": ___syscall197,
 "Le": ___syscall20,
 "Ke": ___syscall219,
 "Zd": ___syscall221,
 "Je": ___syscall3,
 "Ie": ___syscall340,
 "He": ___syscall38,
 "Ge": ___syscall4,
 "Yd": ___syscall5,
 "Xd": ___syscall54,
 "H": ___syscall6,
 "Fe": ___syscall85,
 "Ee": ___syscall91,
 "D": ___unlock,
 "De": ___wait,
 "Wd": __emscripten_push_main_loop_blocker,
 "Vd": __emscripten_push_uncounted_main_loop_blocker,
 "t": _abort,
 "w": alignfault,
 "Ce": _clock_gettime,
 "K": _dladdr,
 "Be": _dlclose,
 "B": _dlerror,
 "Ae": _dlinfo,
 "G": _dlopen,
 "Ud": _dlsym,
 "Td": _emscripten_async_call,
 "Sd": _emscripten_async_load_script,
 "Rd": _emscripten_async_run_script,
 "Qd": _emscripten_async_wget,
 "Pd": _emscripten_async_wget2,
 "Od": _emscripten_async_wget2_abort,
 "Nd": _emscripten_async_wget2_data,
 "Md": _emscripten_async_wget_data,
 "Ld": _emscripten_call_worker,
 "Kd": _emscripten_cancel_main_loop,
 "Jd": _emscripten_coroutine_create,
 "Id": _emscripten_coroutine_next,
 "Hd": _emscripten_create_worker,
 "Gd": _emscripten_debugger,
 "Fd": _emscripten_destroy_worker,
 "Ed": _emscripten_exit_with_live_runtime,
 "J": _emscripten_force_exit,
 "Dd": _emscripten_get_callstack,
 "Cd": _emscripten_get_canvas_size,
 "Bd": _emscripten_get_compiler_setting,
 "Ad": _emscripten_get_device_pixel_ratio,
 "zd": _emscripten_get_main_loop_timing,
 "yd": _emscripten_get_now,
 "xd": _emscripten_get_preloaded_image_data,
 "wd": _emscripten_get_preloaded_image_data_from_FILE,
 "vd": _emscripten_get_worker_queue_size,
 "ud": _emscripten_hide_mouse,
 "td": _emscripten_idb_async_delete,
 "sd": _emscripten_idb_async_exists,
 "rd": _emscripten_idb_async_load,
 "qd": _emscripten_idb_async_store,
 "pd": _emscripten_idb_delete,
 "od": _emscripten_idb_exists,
 "nd": _emscripten_idb_free_blob,
 "md": _emscripten_idb_load,
 "ld": _emscripten_idb_load_blob,
 "kd": _emscripten_idb_read_from_blob,
 "jd": _emscripten_idb_store,
 "id": _emscripten_idb_store_blob,
 "hd": _emscripten_log,
 "h": _emscripten_longjmp,
 "ze": _emscripten_memcpy_big,
 "gd": _emscripten_pause_main_loop,
 "fd": _emscripten_print_double,
 "ed": _emscripten_random,
 "dd": _emscripten_resume_main_loop,
 "cd": _emscripten_run_preload_plugins,
 "bd": _emscripten_run_preload_plugins_data,
 "ad": _emscripten_run_script,
 "$c": _emscripten_run_script_int,
 "_c": _emscripten_run_script_string,
 "Zc": _emscripten_set_canvas_size,
 "Yc": _emscripten_set_main_loop,
 "Xc": _emscripten_set_main_loop_arg,
 "Wc": _emscripten_set_main_loop_expected_blockers,
 "Vc": _emscripten_set_main_loop_timing,
 "Uc": _emscripten_set_socket_close_callback,
 "Tc": _emscripten_set_socket_connection_callback,
 "Sc": _emscripten_set_socket_error_callback,
 "Rc": _emscripten_set_socket_listen_callback,
 "Qc": _emscripten_set_socket_message_callback,
 "Pc": _emscripten_set_socket_open_callback,
 "Oc": _emscripten_sleep,
 "Nc": _emscripten_sleep_with_yield,
 "Mc": _emscripten_wget,
 "Lc": _emscripten_wget_data,
 "Kc": _emscripten_worker_respond,
 "Jc": _emscripten_worker_respond_provisionally,
 "Ic": _emscripten_yield,
 "y": _exit,
 "Hc": _fabs,
 "ye": _fabsf,
 "Gc": _fill_array_close1_open2,
 "Fc": _fill_array_close_open,
 "Ec": _fill_array_open_close,
 "Dc": _fill_array_open_open,
 "Cc": _genrand_close1_open2,
 "Bc": _genrand_close_open,
 "Ac": _genrand_open_close,
 "zc": _genrand_open_open,
 "b": _getTempRet0,
 "yc": _get_idstring,
 "xc": _get_min_array_size,
 "z": _getenv,
 "wc": _gettimeofday,
 "vc": _init_by_array,
 "uc": _init_gen_rand,
 "xe": invoke_d,
 "tc": invoke_ddii,
 "j": invoke_i,
 "l": invoke_ii,
 "i": invoke_iii,
 "we": invoke_iiidi,
 "e": invoke_iiii,
 "p": invoke_iiiii,
 "v": invoke_iiiiii,
 "sc": invoke_iiiiiii,
 "ve": invoke_iiiiiiiiii,
 "qe": invoke_iiiiiij,
 "pe": invoke_iiij,
 "oe": invoke_iij,
 "ne": invoke_iiji,
 "me": invoke_ij,
 "le": invoke_ji,
 "ke": invoke_jij,
 "u": invoke_v,
 "f": invoke_vi,
 "ue": invoke_vid,
 "o": invoke_vii,
 "m": invoke_viii,
 "n": invoke_viiii,
 "F": invoke_viiiii,
 "s": invoke_viiiiiii,
 "q": invoke_viiiiiiii,
 "rc": invoke_viiiiiiiii,
 "qc": _jl_apply_2va,
 "pc": _jl_deserialize_verify_header,
 "je": _jl_dump_fptr_asm,
 "oc": _jl_gc_use,
 "te": _jl_set_fiber,
 "se": _jl_start_fiber,
 "re": _jl_swap_fiber,
 "nc": _jl_threading_profile,
 "mc": _pcre2_code_copy_16,
 "lc": _pcre2_code_copy_32,
 "kc": _pcre2_code_copy_with_tables_16,
 "jc": _pcre2_code_copy_with_tables_32,
 "ic": _pcre2_code_free_16,
 "hc": _pcre2_code_free_32,
 "gc": _pcre2_compile_16,
 "fc": _pcre2_compile_32,
 "ec": _pcre2_compile_context_copy_16,
 "dc": _pcre2_compile_context_copy_32,
 "cc": _pcre2_compile_context_create_16,
 "bc": _pcre2_compile_context_create_32,
 "ac": _pcre2_compile_context_free_16,
 "$b": _pcre2_compile_context_free_32,
 "_b": _pcre2_config_16,
 "Zb": _pcre2_config_32,
 "Yb": _pcre2_convert_context_copy_16,
 "Xb": _pcre2_convert_context_copy_32,
 "Wb": _pcre2_convert_context_create_16,
 "Vb": _pcre2_convert_context_create_32,
 "Ub": _pcre2_convert_context_free_16,
 "Tb": _pcre2_convert_context_free_32,
 "Sb": _pcre2_converted_pattern_free_16,
 "Rb": _pcre2_converted_pattern_free_32,
 "Qb": _pcre2_dfa_match_16,
 "Pb": _pcre2_dfa_match_32,
 "Ob": _pcre2_general_context_copy_16,
 "Nb": _pcre2_general_context_copy_32,
 "Mb": _pcre2_general_context_create_16,
 "Lb": _pcre2_general_context_create_32,
 "Kb": _pcre2_general_context_free_16,
 "Jb": _pcre2_general_context_free_32,
 "Ib": _pcre2_get_error_message_16,
 "Hb": _pcre2_get_error_message_32,
 "Gb": _pcre2_get_mark_16,
 "Fb": _pcre2_get_mark_32,
 "Eb": _pcre2_get_ovector_count_16,
 "Db": _pcre2_get_ovector_count_32,
 "Cb": _pcre2_get_ovector_pointer_16,
 "Bb": _pcre2_get_ovector_pointer_32,
 "Ab": _pcre2_get_startchar_16,
 "zb": _pcre2_get_startchar_32,
 "yb": _pcre2_jit_compile_16,
 "xb": _pcre2_jit_compile_32,
 "wb": _pcre2_jit_free_unused_memory_16,
 "vb": _pcre2_jit_free_unused_memory_32,
 "ub": _pcre2_jit_match_16,
 "tb": _pcre2_jit_match_32,
 "sb": _pcre2_jit_stack_assign_16,
 "rb": _pcre2_jit_stack_assign_32,
 "qb": _pcre2_jit_stack_create_16,
 "pb": _pcre2_jit_stack_create_32,
 "ob": _pcre2_jit_stack_free_16,
 "nb": _pcre2_jit_stack_free_32,
 "mb": _pcre2_maketables_16,
 "lb": _pcre2_maketables_32,
 "kb": _pcre2_match_16,
 "jb": _pcre2_match_32,
 "ib": _pcre2_match_context_copy_16,
 "hb": _pcre2_match_context_copy_32,
 "gb": _pcre2_match_context_create_16,
 "fb": _pcre2_match_context_create_32,
 "eb": _pcre2_match_context_free_16,
 "db": _pcre2_match_context_free_32,
 "cb": _pcre2_match_data_create_16,
 "bb": _pcre2_match_data_create_32,
 "ab": _pcre2_match_data_create_from_pattern_16,
 "$a": _pcre2_match_data_create_from_pattern_32,
 "_a": _pcre2_match_data_free_16,
 "Za": _pcre2_match_data_free_32,
 "Ya": _pcre2_pattern_convert_16,
 "Xa": _pcre2_pattern_convert_32,
 "Wa": _pcre2_pattern_info_16,
 "Va": _pcre2_pattern_info_32,
 "Ua": _pcre2_serialize_decode_16,
 "Ta": _pcre2_serialize_decode_32,
 "Sa": _pcre2_serialize_encode_16,
 "Ra": _pcre2_serialize_encode_32,
 "Qa": _pcre2_serialize_free_16,
 "Pa": _pcre2_serialize_free_32,
 "Oa": _pcre2_serialize_get_number_of_codes_16,
 "Na": _pcre2_serialize_get_number_of_codes_32,
 "Ma": _pcre2_set_bsr_16,
 "La": _pcre2_set_bsr_32,
 "Ka": _pcre2_set_character_tables_16,
 "Ja": _pcre2_set_character_tables_32,
 "Ia": _pcre2_set_compile_extra_options_16,
 "Ha": _pcre2_set_compile_extra_options_32,
 "Ga": _pcre2_set_compile_recursion_guard_16,
 "Fa": _pcre2_set_compile_recursion_guard_32,
 "Ea": _pcre2_set_depth_limit_16,
 "Da": _pcre2_set_depth_limit_32,
 "Ca": _pcre2_set_glob_escape_16,
 "Ba": _pcre2_set_glob_escape_32,
 "Aa": _pcre2_set_glob_separator_16,
 "za": _pcre2_set_glob_separator_32,
 "ya": _pcre2_set_heap_limit_16,
 "xa": _pcre2_set_heap_limit_32,
 "wa": _pcre2_set_match_limit_16,
 "va": _pcre2_set_match_limit_32,
 "ua": _pcre2_set_max_pattern_length_16,
 "ta": _pcre2_set_max_pattern_length_32,
 "sa": _pcre2_set_newline_16,
 "ra": _pcre2_set_newline_32,
 "qa": _pcre2_set_offset_limit_16,
 "pa": _pcre2_set_offset_limit_32,
 "oa": _pcre2_set_parens_nest_limit_16,
 "na": _pcre2_set_parens_nest_limit_32,
 "ma": _pcre2_set_recursion_limit_16,
 "la": _pcre2_set_recursion_limit_32,
 "ka": _pcre2_set_recursion_memory_management_16,
 "ja": _pcre2_set_recursion_memory_management_32,
 "ia": _pcre2_substitute_16,
 "ha": _pcre2_substitute_32,
 "ga": _pcre2_substring_copy_byname_16,
 "fa": _pcre2_substring_copy_byname_32,
 "ea": _pcre2_substring_copy_bynumber_16,
 "da": _pcre2_substring_copy_bynumber_32,
 "ca": _pcre2_substring_free_16,
 "ba": _pcre2_substring_free_32,
 "aa": _pcre2_substring_get_byname_16,
 "$": _pcre2_substring_get_byname_32,
 "_": _pcre2_substring_get_bynumber_16,
 "Z": _pcre2_substring_get_bynumber_32,
 "Y": _pcre2_substring_length_byname_16,
 "X": _pcre2_substring_length_byname_32,
 "W": _pcre2_substring_length_bynumber_16,
 "V": _pcre2_substring_length_bynumber_32,
 "U": _pcre2_substring_list_free_16,
 "T": _pcre2_substring_list_free_32,
 "S": _pcre2_substring_list_get_16,
 "R": _pcre2_substring_list_get_32,
 "Q": _pcre2_substring_nametable_scan_16,
 "P": _pcre2_substring_nametable_scan_32,
 "O": _pcre2_substring_number_from_name_16,
 "N": _pcre2_substring_number_from_name_32,
 "C": _raise,
 "k": _saveSetjmp,
 "A": _sbrk,
 "r": segfault,
 "c": _setTempRet0,
 "I": _setenv,
 "ie": _sigfillset,
 "he": _siglongjmp,
 "M": _sigprocmask,
 "ge": _sqrt,
 "fe": _sqrtf,
 "E": _sysconf,
 "d": _testSetjmp,
 "ee": _timer_create,
 "de": _timer_delete,
 "ce": _timer_settime,
 "be": _unsetenv
};

var asm = Module["asm"](asmGlobalArg, asmLibraryArg, buffer);

var real____wasm_call_ctors = asm["bf"];

asm["bf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real____wasm_call_ctors.apply(null, arguments);
};

var real__strlen = asm["cf"];

asm["cf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__strlen.apply(null, arguments);
};

var real__free = asm["df"];

asm["df"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__free.apply(null, arguments);
};

var real__malloc = asm["ef"];

asm["ef"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__malloc.apply(null, arguments);
};

var real____errno_location = asm["ff"];

asm["ff"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real____errno_location.apply(null, arguments);
};

var real__fflush = asm["gf"];

asm["gf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__fflush.apply(null, arguments);
};

var real__jl_get_current_task = asm["hf"];

asm["hf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_get_current_task.apply(null, arguments);
};

var real__task_ctx_ptr = asm["jf"];

asm["jf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__task_ctx_ptr.apply(null, arguments);
};

var real__jl_get_root_task = asm["kf"];

asm["kf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_get_root_task.apply(null, arguments);
};

var real__jl_task_wait = asm["lf"];

asm["lf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_task_wait.apply(null, arguments);
};

var real__jl_schedule_task = asm["mf"];

asm["mf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_schedule_task.apply(null, arguments);
};

var real__start_task = asm["nf"];

asm["nf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__start_task.apply(null, arguments);
};

var real__jl_toplevel_eval_in = asm["of"];

asm["of"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_toplevel_eval_in.apply(null, arguments);
};

var real__jl_unbox_bool = asm["pf"];

asm["pf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_unbox_bool.apply(null, arguments);
};

var real__realloc = asm["qf"];

asm["qf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__realloc.apply(null, arguments);
};

var real__jl_eval_string = asm["rf"];

asm["rf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_eval_string.apply(null, arguments);
};

var real__jl_string_ptr = asm["sf"];

asm["sf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_string_ptr.apply(null, arguments);
};

var real__jl_call1 = asm["tf"];

asm["tf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_call1.apply(null, arguments);
};

var real__mpfr_set_emin = asm["uf"];

asm["uf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__mpfr_set_emin.apply(null, arguments);
};

var real__jl_initialize = asm["vf"];

asm["vf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_initialize.apply(null, arguments);
};

var real__jl_eval_and_print = asm["wf"];

asm["wf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__jl_eval_and_print.apply(null, arguments);
};

var real__main = asm["xf"];

asm["xf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__main.apply(null, arguments);
};

var real__fileno = asm["yf"];

asm["yf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__fileno.apply(null, arguments);
};

var real___get_tzname = asm["zf"];

asm["zf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real___get_tzname.apply(null, arguments);
};

var real___get_daylight = asm["Af"];

asm["Af"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real___get_daylight.apply(null, arguments);
};

var real___get_timezone = asm["Bf"];

asm["Bf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real___get_timezone.apply(null, arguments);
};

var real___get_environ = asm["Cf"];

asm["Cf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real___get_environ.apply(null, arguments);
};

var real__memalign = asm["Df"];

asm["Df"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__memalign.apply(null, arguments);
};

var real__emscripten_builtin_free = asm["Ef"];

asm["Ef"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__emscripten_builtin_free.apply(null, arguments);
};

var real__emscripten_builtin_memalign = asm["Ff"];

asm["Ff"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__emscripten_builtin_memalign.apply(null, arguments);
};

var real__setThrew = asm["Gf"];

asm["Gf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__setThrew.apply(null, arguments);
};

var real_dynCall_d = asm["Hf"];

asm["Hf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_d.apply(null, arguments);
};

var real_dynCall_ddii = asm["If"];

asm["If"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ddii.apply(null, arguments);
};

var real_dynCall_i = asm["Jf"];

asm["Jf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_i.apply(null, arguments);
};

var real_dynCall_ii = asm["Kf"];

asm["Kf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ii.apply(null, arguments);
};

var real_dynCall_iii = asm["Lf"];

asm["Lf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iii.apply(null, arguments);
};

var real_dynCall_iiidi = asm["Mf"];

asm["Mf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiidi.apply(null, arguments);
};

var real_dynCall_iiii = asm["Nf"];

asm["Nf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiii.apply(null, arguments);
};

var real_dynCall_iiiii = asm["Of"];

asm["Of"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiii.apply(null, arguments);
};

var real_dynCall_iiiiii = asm["Pf"];

asm["Pf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiiii.apply(null, arguments);
};

var real_dynCall_iiiiiii = asm["Qf"];

asm["Qf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiiiii.apply(null, arguments);
};

var real_dynCall_iiiiiiiiii = asm["Rf"];

asm["Rf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiiiiiiii.apply(null, arguments);
};

var real_dynCall_iiiiiij = asm["Sf"];

asm["Sf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiiiij.apply(null, arguments);
};

var real_dynCall_iiij = asm["Tf"];

asm["Tf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiij.apply(null, arguments);
};

var real_dynCall_iij = asm["Uf"];

asm["Uf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iij.apply(null, arguments);
};

var real_dynCall_iiji = asm["Vf"];

asm["Vf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiji.apply(null, arguments);
};

var real_dynCall_ij = asm["Wf"];

asm["Wf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ij.apply(null, arguments);
};

var real_dynCall_ji = asm["Xf"];

asm["Xf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ji.apply(null, arguments);
};

var real_dynCall_jij = asm["Yf"];

asm["Yf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_jij.apply(null, arguments);
};

var real_dynCall_v = asm["Zf"];

asm["Zf"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_v.apply(null, arguments);
};

var real_dynCall_vi = asm["_f"];

asm["_f"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vi.apply(null, arguments);
};

var real_dynCall_vid = asm["$f"];

asm["$f"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vid.apply(null, arguments);
};

var real_dynCall_vii = asm["ag"];

asm["ag"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vii.apply(null, arguments);
};

var real_dynCall_viii = asm["bg"];

asm["bg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viii.apply(null, arguments);
};

var real_dynCall_viiii = asm["cg"];

asm["cg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viiii.apply(null, arguments);
};

var real_dynCall_viiiii = asm["dg"];

asm["dg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viiiii.apply(null, arguments);
};

var real_dynCall_viiiiiii = asm["eg"];

asm["eg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viiiiiii.apply(null, arguments);
};

var real_dynCall_viiiiiiii = asm["fg"];

asm["fg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viiiiiiii.apply(null, arguments);
};

var real_dynCall_viiiiiiiii = asm["gg"];

asm["gg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viiiiiiiii.apply(null, arguments);
};

var real_dynCall_viijj = asm["hg"];

asm["hg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viijj.apply(null, arguments);
};

var real_stackSave = asm["ig"];

asm["ig"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_stackSave.apply(null, arguments);
};

var real_stackAlloc = asm["jg"];

asm["jg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["kg"];

asm["kg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_stackRestore.apply(null, arguments);
};

var real___growWasmMemory = asm["lg"];

asm["lg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real___growWasmMemory.apply(null, arguments);
};

var real_dynCall_iiiji = asm["mg"];

asm["mg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiji.apply(null, arguments);
};

var real_dynCall_jj = asm["ng"];

asm["ng"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_jj.apply(null, arguments);
};

var real_dynCall_jii = asm["og"];

asm["og"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_jii.apply(null, arguments);
};

var real_dynCall_jiii = asm["pg"];

asm["pg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_jiii.apply(null, arguments);
};

var real_dynCall_iji = asm["qg"];

asm["qg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iji.apply(null, arguments);
};

var real_dynCall_iijji = asm["rg"];

asm["rg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iijji.apply(null, arguments);
};

var real_dynCall_viji = asm["sg"];

asm["sg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viji.apply(null, arguments);
};

var real_dynCall_dii = asm["tg"];

asm["tg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_dii.apply(null, arguments);
};

var real_dynCall_fii = asm["ug"];

asm["ug"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_fii.apply(null, arguments);
};

var real_dynCall_j = asm["vg"];

asm["vg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_j.apply(null, arguments);
};

var real_dynCall_if = asm["wg"];

asm["wg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_if.apply(null, arguments);
};

var real_dynCall_id = asm["xg"];

asm["xg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_id.apply(null, arguments);
};

var real_dynCall_fi = asm["yg"];

asm["yg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_fi.apply(null, arguments);
};

var real_dynCall_di = asm["zg"];

asm["zg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_di.apply(null, arguments);
};

var real_dynCall_ijiii = asm["Ag"];

asm["Ag"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ijiii.apply(null, arguments);
};

var real_dynCall_iiiiiiii = asm["Bg"];

asm["Bg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiiiiii.apply(null, arguments);
};

var real_dynCall_iiijjii = asm["Cg"];

asm["Cg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiijjii.apply(null, arguments);
};

var real_dynCall_jiji = asm["Dg"];

asm["Dg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_jiji.apply(null, arguments);
};

var real_dynCall_iiiij = asm["Eg"];

asm["Eg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiij.apply(null, arguments);
};

var real_dynCall_viiiiii = asm["Fg"];

asm["Fg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viiiiii.apply(null, arguments);
};

var real_dynCall_iiiiiiiiiiii = asm["Gg"];

asm["Gg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiiiiiiiiii.apply(null, arguments);
};

var real_dynCall_iid = asm["Hg"];

asm["Hg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iid.apply(null, arguments);
};

var real_dynCall_iidi = asm["Ig"];

asm["Ig"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iidi.apply(null, arguments);
};

var real_dynCall_iifi = asm["Jg"];

asm["Jg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iifi.apply(null, arguments);
};

var real_dynCall_diii = asm["Kg"];

asm["Kg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_diii.apply(null, arguments);
};

var real_dynCall_iidii = asm["Lg"];

asm["Lg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iidii.apply(null, arguments);
};

var real_dynCall_iijj = asm["Mg"];

asm["Mg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iijj.apply(null, arguments);
};

var real_dynCall_f = asm["Ng"];

asm["Ng"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_f.apply(null, arguments);
};

var real_dynCall_iiiiiiiii = asm["Og"];

asm["Og"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiiiiiii.apply(null, arguments);
};

var real_dynCall_idii = asm["Pg"];

asm["Pg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_idii.apply(null, arguments);
};

var real_dynCall_viiij = asm["Qg"];

asm["Qg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viiij.apply(null, arguments);
};

var real_dynCall_dd = asm["Rg"];

asm["Rg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_dd.apply(null, arguments);
};

var real_dynCall_viij = asm["Sg"];

asm["Sg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viij.apply(null, arguments);
};

var real_dynCall_vijj = asm["Tg"];

asm["Tg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vijj.apply(null, arguments);
};

var real_dynCall_viid = asm["Ug"];

asm["Ug"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viid.apply(null, arguments);
};

var real_dynCall_vijji = asm["Vg"];

asm["Vg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vijji.apply(null, arguments);
};

var real_dynCall_vjiiiiiii = asm["Wg"];

asm["Wg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vjiiiiiii.apply(null, arguments);
};

var real_dynCall_vijii = asm["Xg"];

asm["Xg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vijii.apply(null, arguments);
};

var real_dynCall_fijj = asm["Yg"];

asm["Yg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_fijj.apply(null, arguments);
};

var real_dynCall_dijj = asm["Zg"];

asm["Zg"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_dijj.apply(null, arguments);
};

var real_dynCall_iijjjjjjji = asm["_g"];

asm["_g"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iijjjjjjji.apply(null, arguments);
};

var real_dynCall_iijiii = asm["$g"];

asm["$g"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iijiii.apply(null, arguments);
};

var real_dynCall_vij = asm["ah"];

asm["ah"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vij.apply(null, arguments);
};

var real_dynCall_iijii = asm["bh"];

asm["bh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iijii.apply(null, arguments);
};

var real_dynCall_iijjiiii = asm["ch"];

asm["ch"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iijjiiii.apply(null, arguments);
};

var real_dynCall_iiijj = asm["dh"];

asm["dh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiijj.apply(null, arguments);
};

var real_dynCall_iijjii = asm["eh"];

asm["eh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iijjii.apply(null, arguments);
};

var real_dynCall_iiiijiii = asm["fh"];

asm["fh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiijiii.apply(null, arguments);
};

var real_dynCall_ijii = asm["gh"];

asm["gh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ijii.apply(null, arguments);
};

var real_dynCall_ijjii = asm["hh"];

asm["hh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ijjii.apply(null, arguments);
};

var real_dynCall_vd = asm["ih"];

asm["ih"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vd.apply(null, arguments);
};

var real_dynCall_vdiii = asm["jh"];

asm["jh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vdiii.apply(null, arguments);
};

var real_dynCall_vidi = asm["kh"];

asm["kh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vidi.apply(null, arguments);
};

var real_dynCall_vidiiii = asm["lh"];

asm["lh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vidiiii.apply(null, arguments);
};

var real_dynCall_vidiii = asm["mh"];

asm["mh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vidiii.apply(null, arguments);
};

var real_dynCall_ijji = asm["nh"];

asm["nh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ijji.apply(null, arguments);
};

var real_dynCall_vijjjj = asm["oh"];

asm["oh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vijjjj.apply(null, arguments);
};

var real_dynCall_ddi = asm["ph"];

asm["ph"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ddi.apply(null, arguments);
};

var real_dynCall_dddd = asm["qh"];

asm["qh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_dddd.apply(null, arguments);
};

var real_dynCall_iijiiii = asm["rh"];

asm["rh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iijiiii.apply(null, arguments);
};

var real_dynCall_viiijjjijj = asm["sh"];

asm["sh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viiijjjijj.apply(null, arguments);
};

var real_dynCall_viiijjji = asm["th"];

asm["th"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viiijjji.apply(null, arguments);
};

var real_dynCall_fiii = asm["uh"];

asm["uh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_fiii.apply(null, arguments);
};

var real_dynCall_iiiidiiidi = asm["vh"];

asm["vh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiidiiidi.apply(null, arguments);
};

var real_dynCall_idi = asm["wh"];

asm["wh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_idi.apply(null, arguments);
};

var real_dynCall_djd = asm["xh"];

asm["xh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_djd.apply(null, arguments);
};

var real_dynCall_ddd = asm["yh"];

asm["yh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ddd.apply(null, arguments);
};

var real_dynCall_vijiiiii = asm["zh"];

asm["zh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vijiiiii.apply(null, arguments);
};

var real_dynCall_vidii = asm["Ah"];

asm["Ah"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vidii.apply(null, arguments);
};

var real_dynCall_ff = asm["Bh"];

asm["Bh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ff.apply(null, arguments);
};

var real_dynCall_fff = asm["Ch"];

asm["Ch"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_fff.apply(null, arguments);
};

var real_dynCall_vjiiiiiiii = asm["Dh"];

asm["Dh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vjiiiiiiii.apply(null, arguments);
};

var real_dynCall_ijj = asm["Eh"];

asm["Eh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ijj.apply(null, arguments);
};

var real_dynCall_vji = asm["Fh"];

asm["Fh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vji.apply(null, arguments);
};

var real_dynCall_iiiidiii = asm["Gh"];

asm["Gh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiidiii.apply(null, arguments);
};

var real_dynCall_iff = asm["Hh"];

asm["Hh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iff.apply(null, arguments);
};

var real_dynCall_idd = asm["Ih"];

asm["Ih"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_idd.apply(null, arguments);
};

var real_dynCall_vijjj = asm["Jh"];

asm["Jh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_vijjj.apply(null, arguments);
};

var real_dynCall_iijjj = asm["Kh"];

asm["Kh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iijjj.apply(null, arguments);
};

var real_dynCall_ijdi = asm["Lh"];

asm["Lh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ijdi.apply(null, arguments);
};

var real_dynCall_iiiiiiiiiii = asm["Mh"];

asm["Mh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiiiiiiiii.apply(null, arguments);
};

var real_dynCall_ffff = asm["Nh"];

asm["Nh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_ffff.apply(null, arguments);
};

var real_dynCall_fij = asm["Oh"];

asm["Oh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_fij.apply(null, arguments);
};

var real_dynCall_fid = asm["Ph"];

asm["Ph"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_fid.apply(null, arguments);
};

var real_dynCall_dij = asm["Qh"];

asm["Qh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_dij.apply(null, arguments);
};

var real_dynCall_iiiiiiiiid = asm["Rh"];

asm["Rh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iiiiiiiiid.apply(null, arguments);
};

var real_dynCall_viijii = asm["Sh"];

asm["Sh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_viijii.apply(null, arguments);
};

var real_dynCall_iidiiii = asm["Th"];

asm["Th"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real_dynCall_iidiiii.apply(null, arguments);
};

var real__asyncify_start_unwind = asm["Uh"];

asm["Uh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__asyncify_start_unwind.apply(null, arguments);
};

var real__asyncify_stop_unwind = asm["Vh"];

asm["Vh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__asyncify_stop_unwind.apply(null, arguments);
};

var real__asyncify_start_rewind = asm["Wh"];

asm["Wh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__asyncify_start_rewind.apply(null, arguments);
};

var real__asyncify_stop_rewind = asm["Xh"];

asm["Xh"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return real__asyncify_stop_rewind.apply(null, arguments);
};

Module["asm"] = asm;

var ___wasm_call_ctors = Module["___wasm_call_ctors"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["bf"].apply(null, arguments);
};

var _strlen = Module["_strlen"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["cf"].apply(null, arguments);
};

var _free = Module["_free"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["df"].apply(null, arguments);
};

var _malloc = Module["_malloc"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ef"].apply(null, arguments);
};

var ___errno_location = Module["___errno_location"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ff"].apply(null, arguments);
};

var _fflush = Module["_fflush"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["gf"].apply(null, arguments);
};

var _jl_get_current_task = Module["_jl_get_current_task"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["hf"].apply(null, arguments);
};

var _task_ctx_ptr = Module["_task_ctx_ptr"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["jf"].apply(null, arguments);
};

var _jl_get_root_task = Module["_jl_get_root_task"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["kf"].apply(null, arguments);
};

var _jl_task_wait = Module["_jl_task_wait"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["lf"].apply(null, arguments);
};

var _jl_schedule_task = Module["_jl_schedule_task"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["mf"].apply(null, arguments);
};

var _start_task = Module["_start_task"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["nf"].apply(null, arguments);
};

var _jl_toplevel_eval_in = Module["_jl_toplevel_eval_in"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["of"].apply(null, arguments);
};

var _jl_unbox_bool = Module["_jl_unbox_bool"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["pf"].apply(null, arguments);
};

var _realloc = Module["_realloc"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["qf"].apply(null, arguments);
};

var _jl_eval_string = Module["_jl_eval_string"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["rf"].apply(null, arguments);
};

var _jl_string_ptr = Module["_jl_string_ptr"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["sf"].apply(null, arguments);
};

var _jl_call1 = Module["_jl_call1"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["tf"].apply(null, arguments);
};

var _mpfr_set_emin = Module["_mpfr_set_emin"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["uf"].apply(null, arguments);
};

var _jl_initialize = Module["_jl_initialize"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["vf"].apply(null, arguments);
};

var _jl_eval_and_print = Module["_jl_eval_and_print"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["wf"].apply(null, arguments);
};

var _main = Module["_main"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["xf"].apply(null, arguments);
};

var _fileno = Module["_fileno"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["yf"].apply(null, arguments);
};

var __get_tzname = Module["__get_tzname"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["zf"].apply(null, arguments);
};

var __get_daylight = Module["__get_daylight"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Af"].apply(null, arguments);
};

var __get_timezone = Module["__get_timezone"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Bf"].apply(null, arguments);
};

var __get_environ = Module["__get_environ"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Cf"].apply(null, arguments);
};

var _memalign = Module["_memalign"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Df"].apply(null, arguments);
};

var _emscripten_builtin_free = Module["_emscripten_builtin_free"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ef"].apply(null, arguments);
};

var _emscripten_builtin_memalign = Module["_emscripten_builtin_memalign"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ff"].apply(null, arguments);
};

var _setThrew = Module["_setThrew"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Gf"].apply(null, arguments);
};

var dynCall_d = Module["dynCall_d"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Hf"].apply(null, arguments);
};

var dynCall_ddii = Module["dynCall_ddii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["If"].apply(null, arguments);
};

var dynCall_i = Module["dynCall_i"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Jf"].apply(null, arguments);
};

var dynCall_ii = Module["dynCall_ii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Kf"].apply(null, arguments);
};

var dynCall_iii = Module["dynCall_iii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Lf"].apply(null, arguments);
};

var dynCall_iiidi = Module["dynCall_iiidi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Mf"].apply(null, arguments);
};

var dynCall_iiii = Module["dynCall_iiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Nf"].apply(null, arguments);
};

var dynCall_iiiii = Module["dynCall_iiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Of"].apply(null, arguments);
};

var dynCall_iiiiii = Module["dynCall_iiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Pf"].apply(null, arguments);
};

var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Qf"].apply(null, arguments);
};

var dynCall_iiiiiiiiii = Module["dynCall_iiiiiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Rf"].apply(null, arguments);
};

var dynCall_iiiiiij = Module["dynCall_iiiiiij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Sf"].apply(null, arguments);
};

var dynCall_iiij = Module["dynCall_iiij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Tf"].apply(null, arguments);
};

var dynCall_iij = Module["dynCall_iij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Uf"].apply(null, arguments);
};

var dynCall_iiji = Module["dynCall_iiji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Vf"].apply(null, arguments);
};

var dynCall_ij = Module["dynCall_ij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Wf"].apply(null, arguments);
};

var dynCall_ji = Module["dynCall_ji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Xf"].apply(null, arguments);
};

var dynCall_jij = Module["dynCall_jij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Yf"].apply(null, arguments);
};

var dynCall_v = Module["dynCall_v"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Zf"].apply(null, arguments);
};

var dynCall_vi = Module["dynCall_vi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["_f"].apply(null, arguments);
};

var dynCall_vid = Module["dynCall_vid"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["$f"].apply(null, arguments);
};

var dynCall_vii = Module["dynCall_vii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ag"].apply(null, arguments);
};

var dynCall_viii = Module["dynCall_viii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["bg"].apply(null, arguments);
};

var dynCall_viiii = Module["dynCall_viiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["cg"].apply(null, arguments);
};

var dynCall_viiiii = Module["dynCall_viiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["dg"].apply(null, arguments);
};

var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["eg"].apply(null, arguments);
};

var dynCall_viiiiiiii = Module["dynCall_viiiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["fg"].apply(null, arguments);
};

var dynCall_viiiiiiiii = Module["dynCall_viiiiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["gg"].apply(null, arguments);
};

var dynCall_viijj = Module["dynCall_viijj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["hg"].apply(null, arguments);
};

var stackSave = Module["stackSave"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ig"].apply(null, arguments);
};

var stackAlloc = Module["stackAlloc"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["jg"].apply(null, arguments);
};

var stackRestore = Module["stackRestore"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["kg"].apply(null, arguments);
};

var __growWasmMemory = Module["__growWasmMemory"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["lg"].apply(null, arguments);
};

var dynCall_iiiji = Module["dynCall_iiiji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["mg"].apply(null, arguments);
};

var dynCall_jj = Module["dynCall_jj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ng"].apply(null, arguments);
};

var dynCall_jii = Module["dynCall_jii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["og"].apply(null, arguments);
};

var dynCall_jiii = Module["dynCall_jiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["pg"].apply(null, arguments);
};

var dynCall_iji = Module["dynCall_iji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["qg"].apply(null, arguments);
};

var dynCall_iijji = Module["dynCall_iijji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["rg"].apply(null, arguments);
};

var dynCall_viji = Module["dynCall_viji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["sg"].apply(null, arguments);
};

var dynCall_dii = Module["dynCall_dii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["tg"].apply(null, arguments);
};

var dynCall_fii = Module["dynCall_fii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ug"].apply(null, arguments);
};

var dynCall_j = Module["dynCall_j"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["vg"].apply(null, arguments);
};

var dynCall_if = Module["dynCall_if"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["wg"].apply(null, arguments);
};

var dynCall_id = Module["dynCall_id"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["xg"].apply(null, arguments);
};

var dynCall_fi = Module["dynCall_fi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["yg"].apply(null, arguments);
};

var dynCall_di = Module["dynCall_di"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["zg"].apply(null, arguments);
};

var dynCall_ijiii = Module["dynCall_ijiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ag"].apply(null, arguments);
};

var dynCall_iiiiiiii = Module["dynCall_iiiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Bg"].apply(null, arguments);
};

var dynCall_iiijjii = Module["dynCall_iiijjii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Cg"].apply(null, arguments);
};

var dynCall_jiji = Module["dynCall_jiji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Dg"].apply(null, arguments);
};

var dynCall_iiiij = Module["dynCall_iiiij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Eg"].apply(null, arguments);
};

var dynCall_viiiiii = Module["dynCall_viiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Fg"].apply(null, arguments);
};

var dynCall_iiiiiiiiiiii = Module["dynCall_iiiiiiiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Gg"].apply(null, arguments);
};

var dynCall_iid = Module["dynCall_iid"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Hg"].apply(null, arguments);
};

var dynCall_iidi = Module["dynCall_iidi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ig"].apply(null, arguments);
};

var dynCall_iifi = Module["dynCall_iifi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Jg"].apply(null, arguments);
};

var dynCall_diii = Module["dynCall_diii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Kg"].apply(null, arguments);
};

var dynCall_iidii = Module["dynCall_iidii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Lg"].apply(null, arguments);
};

var dynCall_iijj = Module["dynCall_iijj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Mg"].apply(null, arguments);
};

var dynCall_f = Module["dynCall_f"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ng"].apply(null, arguments);
};

var dynCall_iiiiiiiii = Module["dynCall_iiiiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Og"].apply(null, arguments);
};

var dynCall_idii = Module["dynCall_idii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Pg"].apply(null, arguments);
};

var dynCall_viiij = Module["dynCall_viiij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Qg"].apply(null, arguments);
};

var dynCall_dd = Module["dynCall_dd"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Rg"].apply(null, arguments);
};

var dynCall_viij = Module["dynCall_viij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Sg"].apply(null, arguments);
};

var dynCall_vijj = Module["dynCall_vijj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Tg"].apply(null, arguments);
};

var dynCall_viid = Module["dynCall_viid"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ug"].apply(null, arguments);
};

var dynCall_vijji = Module["dynCall_vijji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Vg"].apply(null, arguments);
};

var dynCall_vjiiiiiii = Module["dynCall_vjiiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Wg"].apply(null, arguments);
};

var dynCall_vijii = Module["dynCall_vijii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Xg"].apply(null, arguments);
};

var dynCall_fijj = Module["dynCall_fijj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Yg"].apply(null, arguments);
};

var dynCall_dijj = Module["dynCall_dijj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Zg"].apply(null, arguments);
};

var dynCall_iijjjjjjji = Module["dynCall_iijjjjjjji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["_g"].apply(null, arguments);
};

var dynCall_iijiii = Module["dynCall_iijiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["$g"].apply(null, arguments);
};

var dynCall_vij = Module["dynCall_vij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ah"].apply(null, arguments);
};

var dynCall_iijii = Module["dynCall_iijii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["bh"].apply(null, arguments);
};

var dynCall_iijjiiii = Module["dynCall_iijjiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ch"].apply(null, arguments);
};

var dynCall_iiijj = Module["dynCall_iiijj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["dh"].apply(null, arguments);
};

var dynCall_iijjii = Module["dynCall_iijjii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["eh"].apply(null, arguments);
};

var dynCall_iiiijiii = Module["dynCall_iiiijiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["fh"].apply(null, arguments);
};

var dynCall_ijii = Module["dynCall_ijii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["gh"].apply(null, arguments);
};

var dynCall_ijjii = Module["dynCall_ijjii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["hh"].apply(null, arguments);
};

var dynCall_vd = Module["dynCall_vd"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ih"].apply(null, arguments);
};

var dynCall_vdiii = Module["dynCall_vdiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["jh"].apply(null, arguments);
};

var dynCall_vidi = Module["dynCall_vidi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["kh"].apply(null, arguments);
};

var dynCall_vidiiii = Module["dynCall_vidiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["lh"].apply(null, arguments);
};

var dynCall_vidiii = Module["dynCall_vidiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["mh"].apply(null, arguments);
};

var dynCall_ijji = Module["dynCall_ijji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["nh"].apply(null, arguments);
};

var dynCall_vijjjj = Module["dynCall_vijjjj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["oh"].apply(null, arguments);
};

var dynCall_ddi = Module["dynCall_ddi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["ph"].apply(null, arguments);
};

var dynCall_dddd = Module["dynCall_dddd"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["qh"].apply(null, arguments);
};

var dynCall_iijiiii = Module["dynCall_iijiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["rh"].apply(null, arguments);
};

var dynCall_viiijjjijj = Module["dynCall_viiijjjijj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["sh"].apply(null, arguments);
};

var dynCall_viiijjji = Module["dynCall_viiijjji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["th"].apply(null, arguments);
};

var dynCall_fiii = Module["dynCall_fiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["uh"].apply(null, arguments);
};

var dynCall_iiiidiiidi = Module["dynCall_iiiidiiidi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["vh"].apply(null, arguments);
};

var dynCall_idi = Module["dynCall_idi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["wh"].apply(null, arguments);
};

var dynCall_djd = Module["dynCall_djd"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["xh"].apply(null, arguments);
};

var dynCall_ddd = Module["dynCall_ddd"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["yh"].apply(null, arguments);
};

var dynCall_vijiiiii = Module["dynCall_vijiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["zh"].apply(null, arguments);
};

var dynCall_vidii = Module["dynCall_vidii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ah"].apply(null, arguments);
};

var dynCall_ff = Module["dynCall_ff"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Bh"].apply(null, arguments);
};

var dynCall_fff = Module["dynCall_fff"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ch"].apply(null, arguments);
};

var dynCall_vjiiiiiiii = Module["dynCall_vjiiiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Dh"].apply(null, arguments);
};

var dynCall_ijj = Module["dynCall_ijj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Eh"].apply(null, arguments);
};

var dynCall_vji = Module["dynCall_vji"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Fh"].apply(null, arguments);
};

var dynCall_iiiidiii = Module["dynCall_iiiidiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Gh"].apply(null, arguments);
};

var dynCall_iff = Module["dynCall_iff"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Hh"].apply(null, arguments);
};

var dynCall_idd = Module["dynCall_idd"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ih"].apply(null, arguments);
};

var dynCall_vijjj = Module["dynCall_vijjj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Jh"].apply(null, arguments);
};

var dynCall_iijjj = Module["dynCall_iijjj"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Kh"].apply(null, arguments);
};

var dynCall_ijdi = Module["dynCall_ijdi"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Lh"].apply(null, arguments);
};

var dynCall_iiiiiiiiiii = Module["dynCall_iiiiiiiiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Mh"].apply(null, arguments);
};

var dynCall_ffff = Module["dynCall_ffff"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Nh"].apply(null, arguments);
};

var dynCall_fij = Module["dynCall_fij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Oh"].apply(null, arguments);
};

var dynCall_fid = Module["dynCall_fid"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Ph"].apply(null, arguments);
};

var dynCall_dij = Module["dynCall_dij"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Qh"].apply(null, arguments);
};

var dynCall_iiiiiiiiid = Module["dynCall_iiiiiiiiid"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Rh"].apply(null, arguments);
};

var dynCall_viijii = Module["dynCall_viijii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Sh"].apply(null, arguments);
};

var dynCall_iidiiii = Module["dynCall_iidiiii"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Th"].apply(null, arguments);
};

var _asyncify_start_unwind = Module["_asyncify_start_unwind"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Uh"].apply(null, arguments);
};

var _asyncify_stop_unwind = Module["_asyncify_stop_unwind"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Vh"].apply(null, arguments);
};

var _asyncify_start_rewind = Module["_asyncify_start_rewind"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Wh"].apply(null, arguments);
};

var _asyncify_stop_rewind = Module["_asyncify_stop_rewind"] = function() {
 assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
 assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
 return Module["asm"]["Xh"].apply(null, arguments);
};

function invoke_iii(index, a1, a2) {
 var sp = stackSave();
 try {
  return dynCall_iii(index, a1, a2);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_viiii(index, a1, a2, a3, a4) {
 var sp = stackSave();
 try {
  dynCall_viiii(index, a1, a2, a3, a4);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_i(index) {
 var sp = stackSave();
 try {
  return dynCall_i(index);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_vi(index, a1) {
 var sp = stackSave();
 try {
  dynCall_vi(index, a1);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iiii(index, a1, a2, a3) {
 var sp = stackSave();
 try {
  return dynCall_iiii(index, a1, a2, a3);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_v(index) {
 var sp = stackSave();
 try {
  dynCall_v(index);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_ii(index, a1) {
 var sp = stackSave();
 try {
  return dynCall_ii(index, a1);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iiiii(index, a1, a2, a3, a4) {
 var sp = stackSave();
 try {
  return dynCall_iiiii(index, a1, a2, a3, a4);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_vii(index, a1, a2) {
 var sp = stackSave();
 try {
  dynCall_vii(index, a1, a2);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_viii(index, a1, a2, a3) {
 var sp = stackSave();
 try {
  dynCall_viii(index, a1, a2, a3);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
 var sp = stackSave();
 try {
  return dynCall_iiiiii(index, a1, a2, a3, a4, a5);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
 var sp = stackSave();
 try {
  return dynCall_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_viiiii(index, a1, a2, a3, a4, a5) {
 var sp = stackSave();
 try {
  dynCall_viiiii(index, a1, a2, a3, a4, a5);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
 var sp = stackSave();
 try {
  return dynCall_iiiiiii(index, a1, a2, a3, a4, a5, a6);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
 var sp = stackSave();
 try {
  dynCall_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
 var sp = stackSave();
 try {
  dynCall_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_ddii(index, a1, a2, a3) {
 var sp = stackSave();
 try {
  return dynCall_ddii(index, a1, a2, a3);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iiidi(index, a1, a2, a3, a4) {
 var sp = stackSave();
 try {
  return dynCall_iiidi(index, a1, a2, a3, a4);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
 var sp = stackSave();
 try {
  dynCall_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_vid(index, a1, a2) {
 var sp = stackSave();
 try {
  dynCall_vid(index, a1, a2);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_d(index) {
 var sp = stackSave();
 try {
  return dynCall_d(index);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iiiiiij(index, a1, a2, a3, a4, a5, a6, a7) {
 var sp = stackSave();
 try {
  return dynCall_iiiiiij(index, a1, a2, a3, a4, a5, a6, a7);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_jij(index, a1, a2, a3) {
 var sp = stackSave();
 try {
  return dynCall_jij(index, a1, a2, a3);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_ji(index, a1) {
 var sp = stackSave();
 try {
  return dynCall_ji(index, a1);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_ij(index, a1, a2) {
 var sp = stackSave();
 try {
  return dynCall_ij(index, a1, a2);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iiji(index, a1, a2, a3, a4) {
 var sp = stackSave();
 try {
  return dynCall_iiji(index, a1, a2, a3, a4);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iij(index, a1, a2, a3) {
 var sp = stackSave();
 try {
  return dynCall_iij(index, a1, a2, a3);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

function invoke_iiij(index, a1, a2, a3, a4) {
 var sp = stackSave();
 try {
  return dynCall_iiij(index, a1, a2, a3, a4);
 } catch (e) {
  stackRestore(sp);
  if (e !== e + 0 && e !== "longjmp") throw e;
  _setThrew(1, 0);
 }
}

Module["asm"] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() {
 abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["intArrayToString"]) Module["intArrayToString"] = function() {
 abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["ccall"]) Module["ccall"] = function() {
 abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["cwrap"]) Module["cwrap"] = function() {
 abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["setValue"]) Module["setValue"] = function() {
 abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["getValue"]) Module["getValue"] = function() {
 abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["allocate"]) Module["allocate"] = function() {
 abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["getMemory"]) Module["getMemory"] = function() {
 abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["AsciiToString"]) Module["AsciiToString"] = function() {
 abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["stringToAscii"]) Module["stringToAscii"] = function() {
 abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() {
 abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() {
 abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() {
 abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

Module["stringToUTF8"] = stringToUTF8;

if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() {
 abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() {
 abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() {
 abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() {
 abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() {
 abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() {
 abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() {
 abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() {
 abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["stackTrace"]) Module["stackTrace"] = function() {
 abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() {
 abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["addOnInit"]) Module["addOnInit"] = function() {
 abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() {
 abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

Module["addOnExit"] = addOnExit;

if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() {
 abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() {
 abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() {
 abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() {
 abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["addRunDependency"]) Module["addRunDependency"] = function() {
 abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() {
 abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["ENV"]) Module["ENV"] = function() {
 abort("'ENV' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["FS"]) Module["FS"] = function() {
 abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() {
 abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["FS_createPath"]) Module["FS_createPath"] = function() {
 abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() {
 abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() {
 abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() {
 abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["FS_createLink"]) Module["FS_createLink"] = function() {
 abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() {
 abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["FS_unlink"]) Module["FS_unlink"] = function() {
 abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you");
};

if (!Module["GL"]) Module["GL"] = function() {
 abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() {
 abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["warnOnce"]) Module["warnOnce"] = function() {
 abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() {
 abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() {
 abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["getLEB"]) Module["getLEB"] = function() {
 abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() {
 abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() {
 abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["registerFunctions"]) Module["registerFunctions"] = function() {
 abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["addFunction"]) Module["addFunction"] = function() {
 abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["removeFunction"]) Module["removeFunction"] = function() {
 abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() {
 abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["prettyPrint"]) Module["prettyPrint"] = function() {
 abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["makeBigInt"]) Module["makeBigInt"] = function() {
 abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["dynCall"]) Module["dynCall"] = function() {
 abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() {
 abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["stackSave"]) Module["stackSave"] = function() {
 abort("'stackSave' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["stackRestore"]) Module["stackRestore"] = function() {
 abort("'stackRestore' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["stackAlloc"]) Module["stackAlloc"] = function() {
 abort("'stackAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["establishStackSpace"]) Module["establishStackSpace"] = function() {
 abort("'establishStackSpace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["print"]) Module["print"] = function() {
 abort("'print' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["printErr"]) Module["printErr"] = function() {
 abort("'printErr' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["getTempRet0"]) Module["getTempRet0"] = function() {
 abort("'getTempRet0' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["setTempRet0"]) Module["setTempRet0"] = function() {
 abort("'setTempRet0' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() {
 abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
};

if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", {
 get: function() {
  abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
 }
});

if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", {
 get: function() {
  abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
 }
});

if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", {
 get: function() {
  abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
 }
});

if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", {
 get: function() {
  abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)");
 }
});

function ExitStatus(status) {
 this.name = "ExitStatus";
 this.message = "Program terminated with exit(" + status + ")";
 this.status = status;
}

ExitStatus.prototype = new Error();

ExitStatus.prototype.constructor = ExitStatus;

var calledMain = false;

dependenciesFulfilled = function runCaller() {
 if (!Module["calledRun"]) run();
 if (!Module["calledRun"]) dependenciesFulfilled = runCaller;
};

Module["callMain"] = function callMain(args) {
 assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])');
 assert(__ATPRERUN__.length == 0, "cannot call main when preRun functions remain to be called");
 args = args || [];
 var argc = args.length + 1;
 var argv = stackAlloc((argc + 1) * 4);
 HEAP32[argv >> 2] = allocateUTF8OnStack(thisProgram);
 for (var i = 1; i < argc; i++) {
  HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
 }
 HEAP32[(argv >> 2) + argc] = 0;
 try {
  var ret = Module["_main"](argc, argv);
  if (!Module["noExitRuntime"]) {
   exit(ret, true);
  }
 } catch (e) {
  if (e instanceof ExitStatus) {
   return;
  } else if (e == "SimulateInfiniteLoop") {
   Module["noExitRuntime"] = true;
   return;
  } else {
   var toLog = e;
   if (e && typeof e === "object" && e.stack) {
    toLog = [ e, e.stack ];
   }
   err("exception thrown: " + toLog);
   quit_(1, e);
  }
 } finally {
  calledMain = true;
 }
};

function run(args) {
 args = args || arguments_;
 if (runDependencies > 0) {
  return;
 }
 writeStackCookie();
 preRun();
 if (runDependencies > 0) return;
 if (Module["calledRun"]) return;
 function doRun() {
  if (Module["calledRun"]) return;
  Module["calledRun"] = true;
  if (ABORT) return;
  initRuntime();
  preMain();
  if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
  if (Module["_main"] && shouldRunNow) Module["callMain"](args);
  postRun();
 }
 if (Module["setStatus"]) {
  Module["setStatus"]("Running...");
  setTimeout(function() {
   setTimeout(function() {
    Module["setStatus"]("");
   }, 1);
   doRun();
  }, 1);
 } else {
  doRun();
 }
 checkStackCookie();
}

Module["run"] = run;

function exit(status, implicit) {
 if (implicit && Module["noExitRuntime"] && status === 0) {
  return;
 }
 if (Module["noExitRuntime"]) {
  if (!implicit) {
   err("exit(" + status + ") called, but noExitRuntime is set due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)");
  }
 } else {
  ABORT = true;
  EXITSTATUS = status;
  exitRuntime();
  if (Module["onExit"]) Module["onExit"](status);
 }
 quit_(status, new ExitStatus(status));
}

var abortDecorators = [];

function abort(what) {
 if (Module["onAbort"]) {
  Module["onAbort"](what);
 }
 what += "";
 out(what);
 err(what);
 ABORT = true;
 EXITSTATUS = 1;
 var extra = "";
 var output = "abort(" + what + ") at " + stackTrace() + extra;
 if (abortDecorators) {
  abortDecorators.forEach(function(decorator) {
   output = decorator(output, what);
  });
 }
 throw output;
}

Module["abort"] = abort;

if (Module["preInit"]) {
 if (typeof Module["preInit"] == "function") Module["preInit"] = [ Module["preInit"] ];
 while (Module["preInit"].length > 0) {
  Module["preInit"].pop()();
 }
}

var shouldRunNow = true;

if (Module["noInitialRun"]) {
 shouldRunNow = false;
}

run();

if (typeof window === "object" && (typeof ENVIRONMENT_IS_PTHREAD === "undefined" || !ENVIRONMENT_IS_PTHREAD)) {
 function emrun_register_handlers() {
  var emrun_num_post_messages_in_flight = 0;
  var emrun_should_close_itself = false;
  function postExit(msg) {
   var http = new XMLHttpRequest();
   http.open("POST", "stdio.html", false);
   http.send(msg);
   try {
    window.close();
   } catch (e) {}
  }
  function post(msg) {
   var http = new XMLHttpRequest();
   ++emrun_num_post_messages_in_flight;
   http.onreadystatechange = function() {
    if (http.readyState == 4) {
     if (--emrun_num_post_messages_in_flight == 0 && emrun_should_close_itself) postExit("^exit^" + EXITSTATUS);
    }
   };
   http.open("POST", "stdio.html", true);
   http.send(msg);
  }
  if (document.URL.search("localhost") != -1 || document.URL.search(":6931/") != -1) {
   var emrun_http_sequence_number = 1;
   var prevPrint = out;
   var prevErr = err;
   function emrun_exit() {
    if (emrun_num_post_messages_in_flight == 0) postExit("^exit^" + EXITSTATUS); else emrun_should_close_itself = true;
   }
   Module["addOnExit"](emrun_exit);
   out = function emrun_print(text) {
    post("^out^" + emrun_http_sequence_number++ + "^" + encodeURIComponent(text));
    prevPrint(text);
   };
   err = function emrun_printErr(text) {
    post("^err^" + emrun_http_sequence_number++ + "^" + encodeURIComponent(text));
    prevErr(text);
   };
   function tryToSendPageload() {
    try {
     post("^pageload^");
    } catch (e) {
     setTimeout(tryToSendPageload, 50);
    }
   }
   tryToSendPageload();
  }
 }
 if (typeof Module !== "undefined" && typeof document !== "undefined") emrun_register_handlers();
}
