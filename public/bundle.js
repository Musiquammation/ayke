//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region node_modules/protobufjs/src/util/aspromise.js
var require_aspromise = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = asPromise;
	/**
	* Callback as used by {@link util.asPromise}.
	* @typedef asPromiseCallback
	* @type {function}
	* @param {Error|null} error Error, if any
	* @param {...*} params Additional arguments
	* @returns {undefined}
	*/
	/**
	* Returns a promise from a node-style callback function.
	* @memberof util
	* @param {asPromiseCallback} fn Function to call
	* @param {*} ctx Function context
	* @param {...*} params Function arguments
	* @returns {Promise<*>} Promisified function
	*/
	function asPromise(fn, ctx) {
		var params = new Array(arguments.length - 1), offset = 0, index = 2, pending = true;
		while (index < arguments.length) params[offset++] = arguments[index++];
		return new Promise(function executor(resolve, reject) {
			params[offset] = function callback(err) {
				if (pending) {
					pending = false;
					if (err) reject(err);
					else {
						var params = new Array(arguments.length - 1), offset = 0;
						while (offset < params.length) params[offset++] = arguments[offset];
						resolve.apply(null, params);
					}
				}
			};
			try {
				fn.apply(ctx || null, params);
			} catch (err) {
				if (pending) {
					pending = false;
					reject(err);
				}
			}
		});
	}
}));
//#endregion
//#region node_modules/protobufjs/src/util/base64.js
var require_base64 = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* A minimal base64 implementation for number arrays.
	* @memberof util
	* @namespace
	*/
	var base64 = exports;
	/**
	* Calculates the byte length of a base64 encoded string.
	* @param {string} string Base64 encoded string
	* @returns {number} Byte length
	*/
	base64.length = function length(string) {
		var p = string.length;
		if (!p) return 0;
		while (p > 0 && string.charAt(p - 1) === "=") --p;
		return Math.floor(p * 3 / 4);
	};
	var b64 = new Array(64);
	var s64 = new Array(123);
	for (var i = 0; i < 64;) s64[b64[i] = i < 26 ? i + 65 : i < 52 ? i + 71 : i < 62 ? i - 4 : i - 59 | 43] = i++;
	s64[45] = 62;
	s64[95] = 63;
	/**
	* Encodes a buffer to a base64 encoded string.
	* @param {Uint8Array} buffer Source buffer
	* @param {number} start Source start
	* @param {number} end Source end
	* @returns {string} Base64 encoded string
	*/
	base64.encode = function encode(buffer, start, end) {
		var parts = null, chunk = [];
		var i = 0, j = 0, t;
		while (start < end) {
			var b = buffer[start++];
			switch (j) {
				case 0:
					chunk[i++] = b64[b >> 2];
					t = (b & 3) << 4;
					j = 1;
					break;
				case 1:
					chunk[i++] = b64[t | b >> 4];
					t = (b & 15) << 2;
					j = 2;
					break;
				case 2:
					chunk[i++] = b64[t | b >> 6];
					chunk[i++] = b64[b & 63];
					j = 0;
			}
			if (i > 8191) {
				(parts || (parts = [])).push(String.fromCharCode.apply(String, chunk));
				i = 0;
			}
		}
		if (j) {
			chunk[i++] = b64[t];
			chunk[i++] = 61;
			if (j === 1) chunk[i++] = 61;
		}
		if (parts) {
			if (i) parts.push(String.fromCharCode.apply(String, chunk.slice(0, i)));
			return parts.join("");
		}
		return String.fromCharCode.apply(String, chunk.slice(0, i));
	};
	var invalidEncoding = "invalid encoding";
	/**
	* Decodes a base64 encoded string to a buffer.
	* @param {string} string Source string
	* @param {Uint8Array} buffer Destination buffer
	* @param {number} offset Destination offset
	* @returns {number} Number of bytes written
	* @throws {Error} If encoding is invalid
	*/
	base64.decode = function decode(string, buffer, offset) {
		var start = offset;
		var j = 0, t;
		for (var i = 0; i < string.length;) {
			var c = string.charCodeAt(i++);
			if (c === 61 && j > 1) break;
			if ((c = s64[c]) === void 0) throw Error(invalidEncoding);
			switch (j) {
				case 0:
					t = c;
					j = 1;
					break;
				case 1:
					buffer[offset++] = t << 2 | (c & 48) >> 4;
					t = c;
					j = 2;
					break;
				case 2:
					buffer[offset++] = (t & 15) << 4 | (c & 60) >> 2;
					t = c;
					j = 3;
					break;
				case 3:
					buffer[offset++] = (t & 3) << 6 | c;
					j = 0;
			}
		}
		if (j === 1) throw Error(invalidEncoding);
		return offset - start;
	};
	var base64Re = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
	var base64UrlRe = /[-_]/;
	var base64UrlNoPaddingRe = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}(?:==)?|[A-Za-z0-9_-]{3}=?)?$/;
	/**
	* Tests if the specified string appears to be base64 encoded.
	* @param {string} string String to test
	* @returns {boolean} `true` if probably base64 encoded, otherwise false
	*/
	base64.test = function test(string) {
		return base64Re.test(string) || base64UrlRe.test(string) && base64UrlNoPaddingRe.test(string);
	};
}));
//#endregion
//#region node_modules/protobufjs/src/util/eventemitter.js
var require_eventemitter = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = EventEmitter;
	/**
	* Constructs a new event emitter instance.
	* @classdesc A minimal event emitter.
	* @memberof util
	* @constructor
	*/
	function EventEmitter() {
		/**
		* Registered listeners.
		* @type {Object.<string,*>}
		* @private
		*/
		this._listeners = Object.create(null);
	}
	/**
	* Event listener as used by {@link util.EventEmitter}.
	* @typedef EventEmitterListener
	* @type {function}
	* @param {...*} args Arguments
	* @returns {undefined}
	*/
	/**
	* Registers an event listener.
	* @param {string} evt Event name
	* @param {EventEmitterListener} fn Listener
	* @param {*} [ctx] Listener context
	* @returns {this} `this`
	*/
	EventEmitter.prototype.on = function on(evt, fn, ctx) {
		(this._listeners[evt] || (this._listeners[evt] = [])).push({
			fn,
			ctx: ctx || this
		});
		return this;
	};
	/**
	* Removes an event listener or any matching listeners if arguments are omitted.
	* @param {string} [evt] Event name. Removes all listeners if omitted.
	* @param {EventEmitterListener} [fn] Listener to remove. Removes all listeners of `evt` if omitted.
	* @returns {this} `this`
	*/
	EventEmitter.prototype.off = function off(evt, fn) {
		if (evt === void 0) this._listeners = Object.create(null);
		else if (fn === void 0) this._listeners[evt] = [];
		else {
			var listeners = this._listeners[evt];
			if (!listeners) return this;
			for (var i = 0; i < listeners.length;) if (listeners[i].fn === fn) listeners.splice(i, 1);
			else ++i;
		}
		return this;
	};
	/**
	* Emits an event by calling its listeners with the specified arguments.
	* @param {string} evt Event name
	* @param {...*} args Arguments
	* @returns {this} `this`
	*/
	EventEmitter.prototype.emit = function emit(evt) {
		var listeners = this._listeners[evt];
		if (listeners) {
			var args = [], i = 1;
			for (; i < arguments.length;) args.push(arguments[i++]);
			for (i = 0; i < listeners.length;) listeners[i].fn.apply(listeners[i++].ctx, args);
		}
		return this;
	};
}));
//#endregion
//#region node_modules/protobufjs/src/util/float.js
var require_float = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = factory(factory);
	/**
	* Reads / writes floats / doubles from / to buffers.
	* @name util.float
	* @namespace
	*/
	/**
	* Writes a 32 bit float to a buffer using little endian byte order.
	* @name util.float.writeFloatLE
	* @function
	* @param {number} val Value to write
	* @param {Uint8Array} buf Target buffer
	* @param {number} pos Target buffer offset
	* @returns {undefined}
	*/
	/**
	* Writes a 32 bit float to a buffer using big endian byte order.
	* @name util.float.writeFloatBE
	* @function
	* @param {number} val Value to write
	* @param {Uint8Array} buf Target buffer
	* @param {number} pos Target buffer offset
	* @returns {undefined}
	*/
	/**
	* Reads a 32 bit float from a buffer using little endian byte order.
	* @name util.float.readFloatLE
	* @function
	* @param {Uint8Array} buf Source buffer
	* @param {number} pos Source buffer offset
	* @returns {number} Value read
	*/
	/**
	* Reads a 32 bit float from a buffer using big endian byte order.
	* @name util.float.readFloatBE
	* @function
	* @param {Uint8Array} buf Source buffer
	* @param {number} pos Source buffer offset
	* @returns {number} Value read
	*/
	/**
	* Writes a 64 bit double to a buffer using little endian byte order.
	* @name util.float.writeDoubleLE
	* @function
	* @param {number} val Value to write
	* @param {Uint8Array} buf Target buffer
	* @param {number} pos Target buffer offset
	* @returns {undefined}
	*/
	/**
	* Writes a 64 bit double to a buffer using big endian byte order.
	* @name util.float.writeDoubleBE
	* @function
	* @param {number} val Value to write
	* @param {Uint8Array} buf Target buffer
	* @param {number} pos Target buffer offset
	* @returns {undefined}
	*/
	/**
	* Reads a 64 bit double from a buffer using little endian byte order.
	* @name util.float.readDoubleLE
	* @function
	* @param {Uint8Array} buf Source buffer
	* @param {number} pos Source buffer offset
	* @returns {number} Value read
	*/
	/**
	* Reads a 64 bit double from a buffer using big endian byte order.
	* @name util.float.readDoubleBE
	* @function
	* @param {Uint8Array} buf Source buffer
	* @param {number} pos Source buffer offset
	* @returns {number} Value read
	*/
	function factory(exports$4) {
		if (typeof Float32Array !== "undefined") (function() {
			var f32 = new Float32Array([-0]), f8b = new Uint8Array(f32.buffer), le = f8b[3] === 128;
			function writeFloat_f32_cpy(val, buf, pos) {
				f32[0] = val;
				buf[pos] = f8b[0];
				buf[pos + 1] = f8b[1];
				buf[pos + 2] = f8b[2];
				buf[pos + 3] = f8b[3];
			}
			function writeFloat_f32_rev(val, buf, pos) {
				f32[0] = val;
				buf[pos] = f8b[3];
				buf[pos + 1] = f8b[2];
				buf[pos + 2] = f8b[1];
				buf[pos + 3] = f8b[0];
			}
			/* istanbul ignore next */
			exports$4.writeFloatLE = le ? writeFloat_f32_cpy : writeFloat_f32_rev;
			/* istanbul ignore next */
			exports$4.writeFloatBE = le ? writeFloat_f32_rev : writeFloat_f32_cpy;
			function readFloat_f32_cpy(buf, pos) {
				f8b[0] = buf[pos];
				f8b[1] = buf[pos + 1];
				f8b[2] = buf[pos + 2];
				f8b[3] = buf[pos + 3];
				return f32[0];
			}
			function readFloat_f32_rev(buf, pos) {
				f8b[3] = buf[pos];
				f8b[2] = buf[pos + 1];
				f8b[1] = buf[pos + 2];
				f8b[0] = buf[pos + 3];
				return f32[0];
			}
			/* istanbul ignore next */
			exports$4.readFloatLE = le ? readFloat_f32_cpy : readFloat_f32_rev;
			/* istanbul ignore next */
			exports$4.readFloatBE = le ? readFloat_f32_rev : readFloat_f32_cpy;
		})();
		else (function() {
			function writeFloat_ieee754(writeUint, val, buf, pos) {
				var sign = val < 0 ? 1 : 0;
				if (sign) val = -val;
				if (val === 0) writeUint(1 / val > 0 ? 0 : 2147483648, buf, pos);
				else if (isNaN(val)) writeUint(2143289344, buf, pos);
				else if (val > 34028234663852886e22) writeUint((sign << 31 | 2139095040) >>> 0, buf, pos);
				else if (val < 11754943508222875e-54) writeUint((sign << 31 | Math.round(val / 1401298464324817e-60)) >>> 0, buf, pos);
				else {
					var exponent = Math.floor(Math.log(val) / Math.LN2), mantissa = Math.round(val * Math.pow(2, -exponent) * 8388608) & 8388607;
					writeUint((sign << 31 | exponent + 127 << 23 | mantissa) >>> 0, buf, pos);
				}
			}
			exports$4.writeFloatLE = writeFloat_ieee754.bind(null, writeUintLE);
			exports$4.writeFloatBE = writeFloat_ieee754.bind(null, writeUintBE);
			function readFloat_ieee754(readUint, buf, pos) {
				var uint = readUint(buf, pos), sign = (uint >> 31) * 2 + 1, exponent = uint >>> 23 & 255, mantissa = uint & 8388607;
				return exponent === 255 ? mantissa ? NaN : sign * Infinity : exponent === 0 ? sign * 1401298464324817e-60 * mantissa : sign * Math.pow(2, exponent - 150) * (mantissa + 8388608);
			}
			exports$4.readFloatLE = readFloat_ieee754.bind(null, readUintLE);
			exports$4.readFloatBE = readFloat_ieee754.bind(null, readUintBE);
		})();
		if (typeof Float64Array !== "undefined") (function() {
			var f64 = new Float64Array([-0]), f8b = new Uint8Array(f64.buffer), le = f8b[7] === 128;
			function writeDouble_f64_cpy(val, buf, pos) {
				f64[0] = val;
				buf[pos] = f8b[0];
				buf[pos + 1] = f8b[1];
				buf[pos + 2] = f8b[2];
				buf[pos + 3] = f8b[3];
				buf[pos + 4] = f8b[4];
				buf[pos + 5] = f8b[5];
				buf[pos + 6] = f8b[6];
				buf[pos + 7] = f8b[7];
			}
			function writeDouble_f64_rev(val, buf, pos) {
				f64[0] = val;
				buf[pos] = f8b[7];
				buf[pos + 1] = f8b[6];
				buf[pos + 2] = f8b[5];
				buf[pos + 3] = f8b[4];
				buf[pos + 4] = f8b[3];
				buf[pos + 5] = f8b[2];
				buf[pos + 6] = f8b[1];
				buf[pos + 7] = f8b[0];
			}
			/* istanbul ignore next */
			exports$4.writeDoubleLE = le ? writeDouble_f64_cpy : writeDouble_f64_rev;
			/* istanbul ignore next */
			exports$4.writeDoubleBE = le ? writeDouble_f64_rev : writeDouble_f64_cpy;
			function readDouble_f64_cpy(buf, pos) {
				f8b[0] = buf[pos];
				f8b[1] = buf[pos + 1];
				f8b[2] = buf[pos + 2];
				f8b[3] = buf[pos + 3];
				f8b[4] = buf[pos + 4];
				f8b[5] = buf[pos + 5];
				f8b[6] = buf[pos + 6];
				f8b[7] = buf[pos + 7];
				return f64[0];
			}
			function readDouble_f64_rev(buf, pos) {
				f8b[7] = buf[pos];
				f8b[6] = buf[pos + 1];
				f8b[5] = buf[pos + 2];
				f8b[4] = buf[pos + 3];
				f8b[3] = buf[pos + 4];
				f8b[2] = buf[pos + 5];
				f8b[1] = buf[pos + 6];
				f8b[0] = buf[pos + 7];
				return f64[0];
			}
			/* istanbul ignore next */
			exports$4.readDoubleLE = le ? readDouble_f64_cpy : readDouble_f64_rev;
			/* istanbul ignore next */
			exports$4.readDoubleBE = le ? readDouble_f64_rev : readDouble_f64_cpy;
		})();
		else (function() {
			function writeDouble_ieee754(writeUint, off0, off1, val, buf, pos) {
				var sign = val < 0 ? 1 : 0;
				if (sign) val = -val;
				if (val === 0) {
					writeUint(0, buf, pos + off0);
					writeUint(1 / val > 0 ? 0 : 2147483648, buf, pos + off1);
				} else if (isNaN(val)) {
					writeUint(0, buf, pos + off0);
					writeUint(2146959360, buf, pos + off1);
				} else if (val > 17976931348623157e292) {
					writeUint(0, buf, pos + off0);
					writeUint((sign << 31 | 2146435072) >>> 0, buf, pos + off1);
				} else {
					var mantissa;
					if (val < 22250738585072014e-324) {
						mantissa = val / 5e-324;
						writeUint(mantissa >>> 0, buf, pos + off0);
						writeUint((sign << 31 | mantissa / 4294967296) >>> 0, buf, pos + off1);
					} else {
						var exponent = Math.floor(Math.log(val) / Math.LN2);
						if (exponent === 1024) exponent = 1023;
						mantissa = val * Math.pow(2, -exponent);
						writeUint(mantissa * 4503599627370496 >>> 0, buf, pos + off0);
						writeUint((sign << 31 | exponent + 1023 << 20 | mantissa * 1048576 & 1048575) >>> 0, buf, pos + off1);
					}
				}
			}
			exports$4.writeDoubleLE = writeDouble_ieee754.bind(null, writeUintLE, 0, 4);
			exports$4.writeDoubleBE = writeDouble_ieee754.bind(null, writeUintBE, 4, 0);
			function readDouble_ieee754(readUint, off0, off1, buf, pos) {
				var lo = readUint(buf, pos + off0), hi = readUint(buf, pos + off1);
				var sign = (hi >> 31) * 2 + 1, exponent = hi >>> 20 & 2047, mantissa = 4294967296 * (hi & 1048575) + lo;
				return exponent === 2047 ? mantissa ? NaN : sign * Infinity : exponent === 0 ? sign * 5e-324 * mantissa : sign * Math.pow(2, exponent - 1075) * (mantissa + 4503599627370496);
			}
			exports$4.readDoubleLE = readDouble_ieee754.bind(null, readUintLE, 0, 4);
			exports$4.readDoubleBE = readDouble_ieee754.bind(null, readUintBE, 4, 0);
		})();
		return exports$4;
	}
	function writeUintLE(val, buf, pos) {
		buf[pos] = val & 255;
		buf[pos + 1] = val >>> 8 & 255;
		buf[pos + 2] = val >>> 16 & 255;
		buf[pos + 3] = val >>> 24;
	}
	function writeUintBE(val, buf, pos) {
		buf[pos] = val >>> 24;
		buf[pos + 1] = val >>> 16 & 255;
		buf[pos + 2] = val >>> 8 & 255;
		buf[pos + 3] = val & 255;
	}
	function readUintLE(buf, pos) {
		return (buf[pos] | buf[pos + 1] << 8 | buf[pos + 2] << 16 | buf[pos + 3] << 24) >>> 0;
	}
	function readUintBE(buf, pos) {
		return (buf[pos] << 24 | buf[pos + 1] << 16 | buf[pos + 2] << 8 | buf[pos + 3]) >>> 0;
	}
}));
//#endregion
//#region node_modules/protobufjs/src/util/utf8.js
var require_utf8 = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* A minimal UTF8 implementation.
	* @memberof util
	* @namespace
	*/
	var utf8 = exports;
	var looseDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
	var strictDecoder;
	var TEXT_DECODER_MIN_LENGTH = 64;
	try {
		strictDecoder = new TextDecoder("utf-8", {
			fatal: true,
			ignoreBOM: true
		});
	} catch (err) {
		strictDecoder = looseDecoder;
	}
	/**
	* Calculates the UTF8 byte length of a string.
	* @param {string} string String
	* @returns {number} Byte length
	*/
	utf8.length = function utf8_length(string) {
		var len = 0, c = 0;
		for (var i = 0; i < string.length; ++i) {
			c = string.charCodeAt(i);
			if (c < 128) len += 1;
			else if (c < 2048) len += 2;
			else if ((c & 64512) === 55296 && (string.charCodeAt(i + 1) & 64512) === 56320) {
				++i;
				len += 4;
			} else len += 3;
		}
		return len;
	};
	function utf8_read_decoder(decoder, buffer, start, end) {
		var source = start === 0 && end === buffer.length ? buffer : buffer.subarray(start, end);
		return decoder.decode(source);
	}
	/**
	* Reads UTF8 bytes as a string.
	* @param {Uint8Array} buffer Source buffer
	* @param {number} start Source start
	* @param {number} end Source end
	* @returns {string} String read
	*/
	utf8.read = function utf8_read_loose(buffer, start, end) {
		if (end - start < 1) return "";
		if (end - start >= TEXT_DECODER_MIN_LENGTH) return utf8_read_decoder(looseDecoder, buffer, start, end);
		var str = "", i = start, c1, c2, c3, c4, c5, c6, c7, c8;
		for (; i + 7 < end; i += 8) {
			c1 = buffer[i];
			c2 = buffer[i + 1];
			c3 = buffer[i + 2];
			c4 = buffer[i + 3];
			c5 = buffer[i + 4];
			c6 = buffer[i + 5];
			c7 = buffer[i + 6];
			c8 = buffer[i + 7];
			if ((c1 | c2 | c3 | c4 | c5 | c6 | c7 | c8) & 128) return str + utf8_read_decoder(looseDecoder, buffer, i, end);
			str += String.fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8);
		}
		for (; i < end; ++i) {
			c1 = buffer[i];
			if (c1 & 128) return str + utf8_read_decoder(looseDecoder, buffer, i, end);
			str += String.fromCharCode(c1);
		}
		return str;
	};
	/**
	* Reads UTF8 bytes as a string, rejecting invalid UTF8.
	* @param {Uint8Array} buffer Source buffer
	* @param {number} start Source start
	* @param {number} end Source end
	* @returns {string} String read
	*/
	utf8.readStrict = function utf8_read_strict(buffer, start, end) {
		if (end - start < 1) return "";
		if (end - start >= TEXT_DECODER_MIN_LENGTH) return utf8_read_decoder(strictDecoder, buffer, start, end);
		var str = "", i = start, c1, c2, c3, c4, c5, c6, c7, c8;
		for (; i + 7 < end; i += 8) {
			c1 = buffer[i];
			c2 = buffer[i + 1];
			c3 = buffer[i + 2];
			c4 = buffer[i + 3];
			c5 = buffer[i + 4];
			c6 = buffer[i + 5];
			c7 = buffer[i + 6];
			c8 = buffer[i + 7];
			if ((c1 | c2 | c3 | c4 | c5 | c6 | c7 | c8) & 128) return str + utf8_read_decoder(strictDecoder, buffer, i, end);
			str += String.fromCharCode(c1, c2, c3, c4, c5, c6, c7, c8);
		}
		for (; i < end; ++i) {
			c1 = buffer[i];
			if (c1 & 128) return str + utf8_read_decoder(strictDecoder, buffer, i, end);
			str += String.fromCharCode(c1);
		}
		return str;
	};
	/**
	* Writes a string as UTF8 bytes.
	* @param {string} string Source string
	* @param {Uint8Array} buffer Destination buffer
	* @param {number} offset Destination offset
	* @returns {number} Bytes written
	*/
	utf8.write = function utf8_write(string, buffer, offset) {
		var start = offset, c1, c2;
		for (var i = 0; i < string.length; ++i) {
			c1 = string.charCodeAt(i);
			if (c1 < 128) buffer[offset++] = c1;
			else if (c1 < 2048) {
				buffer[offset++] = c1 >> 6 | 192;
				buffer[offset++] = c1 & 63 | 128;
			} else if ((c1 & 64512) === 55296 && ((c2 = string.charCodeAt(i + 1)) & 64512) === 56320) {
				c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
				++i;
				buffer[offset++] = c1 >> 18 | 240;
				buffer[offset++] = c1 >> 12 & 63 | 128;
				buffer[offset++] = c1 >> 6 & 63 | 128;
				buffer[offset++] = c1 & 63 | 128;
			} else {
				buffer[offset++] = c1 >> 12 | 224;
				buffer[offset++] = c1 >> 6 & 63 | 128;
				buffer[offset++] = c1 & 63 | 128;
			}
		}
		return offset - start;
	};
}));
//#endregion
//#region node_modules/protobufjs/src/util/pool.js
var require_pool = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = pool;
	/**
	* An allocator as used by {@link util.pool}.
	* @typedef PoolAllocator
	* @type {function}
	* @param {number} size Buffer size
	* @returns {Uint8Array} Buffer
	*/
	/**
	* A slicer as used by {@link util.pool}.
	* @typedef PoolSlicer
	* @type {function}
	* @param {number} start Start offset
	* @param {number} end End offset
	* @returns {Uint8Array} Buffer slice
	* @this Uint8Array
	*/
	/**
	* A general purpose buffer pool.
	* @memberof util
	* @function
	* @param {PoolAllocator} alloc Allocator
	* @param {PoolSlicer} slice Slicer
	* @param {number} [size=8192] Slab size
	* @returns {PoolAllocator} Pooled allocator
	*/
	function pool(alloc, slice, size) {
		var SIZE = size || 8192;
		var MAX = SIZE >>> 1;
		var slab = null;
		var offset = SIZE;
		return function pool_alloc(size) {
			if (size < 1 || size > MAX) return alloc(size);
			if (offset + size > SIZE) {
				slab = alloc(SIZE);
				offset = 0;
			}
			var buf = slice.call(slab, offset, offset += size);
			if (offset & 7) offset = (offset | 7) + 1;
			return buf;
		};
	}
}));
//#endregion
//#region node_modules/protobufjs/src/util/longbits.js
var require_longbits = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = LongBits;
	var Long;
	/**
	* Constructs new long bits.
	* @classdesc Helper class for working with the low and high bits of a 64 bit value.
	* @memberof util
	* @constructor
	* @param {number} lo Low 32 bits, unsigned
	* @param {number} hi High 32 bits, unsigned
	*/
	function LongBits(lo, hi) {
		/**
		* Low bits.
		* @type {number}
		*/
		this.lo = lo >>> 0;
		/**
		* High bits.
		* @type {number}
		*/
		this.hi = hi >>> 0;
	}
	/**
	* Zero bits.
	* @memberof util.LongBits
	* @type {util.LongBits}
	*/
	var zero = LongBits.zero = new LongBits(0, 0);
	zero.toNumber = function() {
		return 0;
	};
	zero.zzEncode = zero.zzDecode = function() {
		return this;
	};
	zero.length = function() {
		return 1;
	};
	/**
	* Zero hash.
	* @memberof util.LongBits
	* @type {string}
	*/
	var zeroHash = LongBits.zeroHash = "\0\0\0\0\0\0\0\0";
	/**
	* Constructs new long bits from the specified number.
	* @param {number} value Value
	* @returns {util.LongBits} Instance
	*/
	LongBits.fromNumber = function fromNumber(value) {
		if (value === 0) return zero;
		var sign = value < 0;
		if (sign) value = -value;
		var lo = value >>> 0, hi = (value - lo) / 4294967296 >>> 0;
		if (sign) {
			hi = ~hi >>> 0;
			lo = ~lo >>> 0;
			if (++lo > 4294967295) {
				lo = 0;
				if (++hi > 4294967295) hi = 0;
			}
		}
		return new LongBits(lo, hi);
	};
	/**
	* Constructs new long bits from a number, long or string.
	* @param {Long|number|string} value Value
	* @returns {util.LongBits} Instance
	*/
	LongBits.from = function from(value) {
		if (typeof value === "number") return LongBits.fromNumber(value);
		if (typeof value === "string" || value instanceof String) {
			/* istanbul ignore else */
			if (Long) value = Long.fromString(value);
			else return LongBits.fromNumber(parseInt(value, 10));
		}
		return value.low || value.high ? new LongBits(value.low >>> 0, value.high >>> 0) : zero;
	};
	/**
	* Converts this long bits to a possibly unsafe JavaScript number.
	* @param {boolean} [unsigned=false] Whether unsigned or not
	* @returns {number} Possibly unsafe number
	*/
	LongBits.prototype.toNumber = function toNumber(unsigned) {
		if (!unsigned && this.hi >>> 31) {
			var lo = ~this.lo + 1 >>> 0, hi = ~this.hi >>> 0;
			if (!lo) hi = hi + 1 >>> 0;
			return -(lo + hi * 4294967296);
		}
		return this.lo + this.hi * 4294967296;
	};
	/**
	* Converts this long bits to a long.
	* @param {boolean} [unsigned=false] Whether unsigned or not
	* @returns {Long} Long
	*/
	LongBits.prototype.toLong = function toLong(unsigned) {
		return Long ? new Long(this.lo | 0, this.hi | 0, Boolean(unsigned)) : {
			low: this.lo | 0,
			high: this.hi | 0,
			unsigned: Boolean(unsigned)
		};
	};
	var charCodeAt = String.prototype.charCodeAt;
	/**
	* Constructs new long bits from the specified 8 characters long hash.
	* @param {string} hash Hash
	* @returns {util.LongBits} Bits
	*/
	LongBits.fromHash = function fromHash(hash) {
		if (hash === zeroHash) return zero;
		return new LongBits((charCodeAt.call(hash, 0) | charCodeAt.call(hash, 1) << 8 | charCodeAt.call(hash, 2) << 16 | charCodeAt.call(hash, 3) << 24) >>> 0, (charCodeAt.call(hash, 4) | charCodeAt.call(hash, 5) << 8 | charCodeAt.call(hash, 6) << 16 | charCodeAt.call(hash, 7) << 24) >>> 0);
	};
	/**
	* Converts this long bits to a 8 characters long hash.
	* @returns {string} Hash
	*/
	LongBits.prototype.toHash = function toHash() {
		return String.fromCharCode(this.lo & 255, this.lo >>> 8 & 255, this.lo >>> 16 & 255, this.lo >>> 24, this.hi & 255, this.hi >>> 8 & 255, this.hi >>> 16 & 255, this.hi >>> 24);
	};
	/**
	* Zig-zag encodes this long bits.
	* @returns {util.LongBits} `this`
	*/
	LongBits.prototype.zzEncode = function zzEncode() {
		var mask = this.hi >> 31;
		this.hi = ((this.hi << 1 | this.lo >>> 31) ^ mask) >>> 0;
		this.lo = (this.lo << 1 ^ mask) >>> 0;
		return this;
	};
	/**
	* Zig-zag decodes this long bits.
	* @returns {util.LongBits} `this`
	*/
	LongBits.prototype.zzDecode = function zzDecode() {
		var mask = -(this.lo & 1);
		this.lo = ((this.lo >>> 1 | this.hi << 31) ^ mask) >>> 0;
		this.hi = (this.hi >>> 1 ^ mask) >>> 0;
		return this;
	};
	/**
	* Calculates the length of this longbits when encoded as a varint.
	* @returns {number} Length
	*/
	LongBits.prototype.length = function length() {
		var part0 = this.lo, part1 = (this.lo >>> 28 | this.hi << 4) >>> 0, part2 = this.hi >>> 24;
		return part2 === 0 ? part1 === 0 ? part0 < 16384 ? part0 < 128 ? 1 : 2 : part0 < 2097152 ? 3 : 4 : part1 < 16384 ? part1 < 128 ? 5 : 6 : part1 < 2097152 ? 7 : 8 : part2 < 128 ? 9 : 10;
	};
	LongBits._configure = function(Long_) {
		Long = Long_;
	};
}));
//#endregion
//#region node_modules/long/umd/index.js
var require_umd = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	(function(global, factory) {
		function preferDefault(exports$1) {
			return exports$1.default || exports$1;
		}
		if (typeof define === "function" && define.amd) define([], function() {
			var exports$2 = {};
			factory(exports$2);
			return preferDefault(exports$2);
		});
		else if (typeof exports === "object") {
			factory(exports);
			if (typeof module === "object") module.exports = preferDefault(exports);
		} else (function() {
			var exports$3 = {};
			factory(exports$3);
			global.Long = preferDefault(exports$3);
		})();
	})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : exports, function(_exports) {
		"use strict";
		Object.defineProperty(_exports, "__esModule", { value: true });
		_exports.default = void 0;
		/**
		* @license
		* Copyright 2009 The Closure Library Authors
		* Copyright 2020 Daniel Wirtz / The long.js Authors.
		*
		* Licensed under the Apache License, Version 2.0 (the "License");
		* you may not use this file except in compliance with the License.
		* You may obtain a copy of the License at
		*
		*     http://www.apache.org/licenses/LICENSE-2.0
		*
		* Unless required by applicable law or agreed to in writing, software
		* distributed under the License is distributed on an "AS IS" BASIS,
		* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
		* See the License for the specific language governing permissions and
		* limitations under the License.
		*
		* SPDX-License-Identifier: Apache-2.0
		*/
		var wasm = null;
		try {
			wasm = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([
				0,
				97,
				115,
				109,
				1,
				0,
				0,
				0,
				1,
				13,
				2,
				96,
				0,
				1,
				127,
				96,
				4,
				127,
				127,
				127,
				127,
				1,
				127,
				3,
				7,
				6,
				0,
				1,
				1,
				1,
				1,
				1,
				6,
				6,
				1,
				127,
				1,
				65,
				0,
				11,
				7,
				50,
				6,
				3,
				109,
				117,
				108,
				0,
				1,
				5,
				100,
				105,
				118,
				95,
				115,
				0,
				2,
				5,
				100,
				105,
				118,
				95,
				117,
				0,
				3,
				5,
				114,
				101,
				109,
				95,
				115,
				0,
				4,
				5,
				114,
				101,
				109,
				95,
				117,
				0,
				5,
				8,
				103,
				101,
				116,
				95,
				104,
				105,
				103,
				104,
				0,
				0,
				10,
				191,
				1,
				6,
				4,
				0,
				35,
				0,
				11,
				36,
				1,
				1,
				126,
				32,
				0,
				173,
				32,
				1,
				173,
				66,
				32,
				134,
				132,
				32,
				2,
				173,
				32,
				3,
				173,
				66,
				32,
				134,
				132,
				126,
				34,
				4,
				66,
				32,
				135,
				167,
				36,
				0,
				32,
				4,
				167,
				11,
				36,
				1,
				1,
				126,
				32,
				0,
				173,
				32,
				1,
				173,
				66,
				32,
				134,
				132,
				32,
				2,
				173,
				32,
				3,
				173,
				66,
				32,
				134,
				132,
				127,
				34,
				4,
				66,
				32,
				135,
				167,
				36,
				0,
				32,
				4,
				167,
				11,
				36,
				1,
				1,
				126,
				32,
				0,
				173,
				32,
				1,
				173,
				66,
				32,
				134,
				132,
				32,
				2,
				173,
				32,
				3,
				173,
				66,
				32,
				134,
				132,
				128,
				34,
				4,
				66,
				32,
				135,
				167,
				36,
				0,
				32,
				4,
				167,
				11,
				36,
				1,
				1,
				126,
				32,
				0,
				173,
				32,
				1,
				173,
				66,
				32,
				134,
				132,
				32,
				2,
				173,
				32,
				3,
				173,
				66,
				32,
				134,
				132,
				129,
				34,
				4,
				66,
				32,
				135,
				167,
				36,
				0,
				32,
				4,
				167,
				11,
				36,
				1,
				1,
				126,
				32,
				0,
				173,
				32,
				1,
				173,
				66,
				32,
				134,
				132,
				32,
				2,
				173,
				32,
				3,
				173,
				66,
				32,
				134,
				132,
				130,
				34,
				4,
				66,
				32,
				135,
				167,
				36,
				0,
				32,
				4,
				167,
				11
			])), {}).exports;
		} catch {}
		/**
		* Constructs a 64 bit two's-complement integer, given its low and high 32 bit values as *signed* integers.
		*  See the from* functions below for more convenient ways of constructing Longs.
		* @exports Long
		* @class A Long class for representing a 64 bit two's-complement integer value.
		* @param {number} low The low (signed) 32 bits of the long
		* @param {number} high The high (signed) 32 bits of the long
		* @param {boolean=} unsigned Whether unsigned or not, defaults to signed
		* @constructor
		*/
		function Long(low, high, unsigned) {
			/**
			* The low 32 bits as a signed value.
			* @type {number}
			*/
			this.low = low | 0;
			/**
			* The high 32 bits as a signed value.
			* @type {number}
			*/
			this.high = high | 0;
			/**
			* Whether unsigned or not.
			* @type {boolean}
			*/
			this.unsigned = !!unsigned;
		}
		/**
		* An indicator used to reliably determine if an object is a Long or not.
		* @type {boolean}
		* @const
		* @private
		*/
		Long.prototype.__isLong__;
		Object.defineProperty(Long.prototype, "__isLong__", { value: true });
		/**
		* @function
		* @param {*} obj Object
		* @returns {boolean}
		* @inner
		*/
		function isLong(obj) {
			return (obj && obj["__isLong__"]) === true;
		}
		/**
		* @function
		* @param {*} value number
		* @returns {number}
		* @inner
		*/
		function ctz32(value) {
			var c = Math.clz32(value & -value);
			return value ? 31 - c : c;
		}
		/**
		* Tests if the specified object is a Long.
		* @function
		* @param {*} obj Object
		* @returns {boolean}
		*/
		Long.isLong = isLong;
		/**
		* A cache of the Long representations of small integer values.
		* @type {!Object}
		* @inner
		*/
		var INT_CACHE = {};
		/**
		* A cache of the Long representations of small unsigned integer values.
		* @type {!Object}
		* @inner
		*/
		var UINT_CACHE = {};
		/**
		* @param {number} value
		* @param {boolean=} unsigned
		* @returns {!Long}
		* @inner
		*/
		function fromInt(value, unsigned) {
			var obj, cachedObj, cache;
			if (unsigned) {
				value >>>= 0;
				if (cache = 0 <= value && value < 256) {
					cachedObj = UINT_CACHE[value];
					if (cachedObj) return cachedObj;
				}
				obj = fromBits(value, 0, true);
				if (cache) UINT_CACHE[value] = obj;
				return obj;
			} else {
				value |= 0;
				if (cache = -128 <= value && value < 128) {
					cachedObj = INT_CACHE[value];
					if (cachedObj) return cachedObj;
				}
				obj = fromBits(value, value < 0 ? -1 : 0, false);
				if (cache) INT_CACHE[value] = obj;
				return obj;
			}
		}
		/**
		* Returns a Long representing the given 32 bit integer value.
		* @function
		* @param {number} value The 32 bit integer in question
		* @param {boolean=} unsigned Whether unsigned or not, defaults to signed
		* @returns {!Long} The corresponding Long value
		*/
		Long.fromInt = fromInt;
		/**
		* @param {number} value
		* @param {boolean=} unsigned
		* @returns {!Long}
		* @inner
		*/
		function fromNumber(value, unsigned) {
			if (isNaN(value)) return unsigned ? UZERO : ZERO;
			if (unsigned) {
				if (value < 0) return UZERO;
				if (value >= TWO_PWR_64_DBL) return MAX_UNSIGNED_VALUE;
			} else {
				if (value <= -TWO_PWR_63_DBL) return MIN_VALUE;
				if (value + 1 >= TWO_PWR_63_DBL) return MAX_VALUE;
			}
			if (value < 0) return fromNumber(-value, unsigned).neg();
			return fromBits(value % TWO_PWR_32_DBL | 0, value / TWO_PWR_32_DBL | 0, unsigned);
		}
		/**
		* Returns a Long representing the given value, provided that it is a finite number. Otherwise, zero is returned.
		* @function
		* @param {number} value The number in question
		* @param {boolean=} unsigned Whether unsigned or not, defaults to signed
		* @returns {!Long} The corresponding Long value
		*/
		Long.fromNumber = fromNumber;
		/**
		* @param {number} lowBits
		* @param {number} highBits
		* @param {boolean=} unsigned
		* @returns {!Long}
		* @inner
		*/
		function fromBits(lowBits, highBits, unsigned) {
			return new Long(lowBits, highBits, unsigned);
		}
		/**
		* Returns a Long representing the 64 bit integer that comes by concatenating the given low and high bits. Each is
		*  assumed to use 32 bits.
		* @function
		* @param {number} lowBits The low 32 bits
		* @param {number} highBits The high 32 bits
		* @param {boolean=} unsigned Whether unsigned or not, defaults to signed
		* @returns {!Long} The corresponding Long value
		*/
		Long.fromBits = fromBits;
		/**
		* @function
		* @param {number} base
		* @param {number} exponent
		* @returns {number}
		* @inner
		*/
		var pow_dbl = Math.pow;
		/**
		* @param {string} str
		* @param {(boolean|number)=} unsigned
		* @param {number=} radix
		* @returns {!Long}
		* @inner
		*/
		function fromString(str, unsigned, radix) {
			if (str.length === 0) throw Error("empty string");
			if (typeof unsigned === "number") {
				radix = unsigned;
				unsigned = false;
			} else unsigned = !!unsigned;
			if (str === "NaN" || str === "Infinity" || str === "+Infinity" || str === "-Infinity") return unsigned ? UZERO : ZERO;
			radix = radix || 10;
			if (radix < 2 || 36 < radix) throw RangeError("radix");
			var p;
			if ((p = str.indexOf("-")) > 0) throw Error("interior hyphen");
			else if (p === 0) return fromString(str.substring(1), unsigned, radix).neg();
			var radixToPower = fromNumber(pow_dbl(radix, 8));
			var result = ZERO;
			for (var i = 0; i < str.length; i += 8) {
				var size = Math.min(8, str.length - i), value = parseInt(str.substring(i, i + size), radix);
				if (size < 8) {
					var power = fromNumber(pow_dbl(radix, size));
					result = result.mul(power).add(fromNumber(value));
				} else {
					result = result.mul(radixToPower);
					result = result.add(fromNumber(value));
				}
			}
			result.unsigned = unsigned;
			return result;
		}
		/**
		* Returns a Long representation of the given string, written using the specified radix.
		* @function
		* @param {string} str The textual representation of the Long
		* @param {(boolean|number)=} unsigned Whether unsigned or not, defaults to signed
		* @param {number=} radix The radix in which the text is written (2-36), defaults to 10
		* @returns {!Long} The corresponding Long value
		*/
		Long.fromString = fromString;
		/**
		* @function
		* @param {!Long|number|string|!{low: number, high: number, unsigned: boolean}} val
		* @param {boolean=} unsigned
		* @returns {!Long}
		* @inner
		*/
		function fromValue(val, unsigned) {
			if (typeof val === "number") return fromNumber(val, unsigned);
			if (typeof val === "string") return fromString(val, unsigned);
			return fromBits(val.low, val.high, typeof unsigned === "boolean" ? unsigned : val.unsigned);
		}
		/**
		* Converts the specified value to a Long using the appropriate from* function for its type.
		* @function
		* @param {!Long|number|bigint|string|!{low: number, high: number, unsigned: boolean}} val Value
		* @param {boolean=} unsigned Whether unsigned or not, defaults to signed
		* @returns {!Long}
		*/
		Long.fromValue = fromValue;
		/**
		* @type {number}
		* @const
		* @inner
		*/
		var TWO_PWR_16_DBL = 65536;
		/**
		* @type {number}
		* @const
		* @inner
		*/
		var TWO_PWR_24_DBL = 1 << 24;
		/**
		* @type {number}
		* @const
		* @inner
		*/
		var TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;
		/**
		* @type {number}
		* @const
		* @inner
		*/
		var TWO_PWR_64_DBL = TWO_PWR_32_DBL * TWO_PWR_32_DBL;
		/**
		* @type {number}
		* @const
		* @inner
		*/
		var TWO_PWR_63_DBL = TWO_PWR_64_DBL / 2;
		/**
		* @type {!Long}
		* @const
		* @inner
		*/
		var TWO_PWR_24 = fromInt(TWO_PWR_24_DBL);
		/**
		* @type {!Long}
		* @inner
		*/
		var ZERO = fromInt(0);
		/**
		* Signed zero.
		* @type {!Long}
		*/
		Long.ZERO = ZERO;
		/**
		* @type {!Long}
		* @inner
		*/
		var UZERO = fromInt(0, true);
		/**
		* Unsigned zero.
		* @type {!Long}
		*/
		Long.UZERO = UZERO;
		/**
		* @type {!Long}
		* @inner
		*/
		var ONE = fromInt(1);
		/**
		* Signed one.
		* @type {!Long}
		*/
		Long.ONE = ONE;
		/**
		* @type {!Long}
		* @inner
		*/
		var UONE = fromInt(1, true);
		/**
		* Unsigned one.
		* @type {!Long}
		*/
		Long.UONE = UONE;
		/**
		* @type {!Long}
		* @inner
		*/
		var NEG_ONE = fromInt(-1);
		/**
		* Signed negative one.
		* @type {!Long}
		*/
		Long.NEG_ONE = NEG_ONE;
		/**
		* @type {!Long}
		* @inner
		*/
		var MAX_VALUE = fromBits(-1, 2147483647, false);
		/**
		* Maximum signed value.
		* @type {!Long}
		*/
		Long.MAX_VALUE = MAX_VALUE;
		/**
		* @type {!Long}
		* @inner
		*/
		var MAX_UNSIGNED_VALUE = fromBits(-1, -1, true);
		/**
		* Maximum unsigned value.
		* @type {!Long}
		*/
		Long.MAX_UNSIGNED_VALUE = MAX_UNSIGNED_VALUE;
		/**
		* @type {!Long}
		* @inner
		*/
		var MIN_VALUE = fromBits(0, -2147483648, false);
		/**
		* Minimum signed value.
		* @type {!Long}
		*/
		Long.MIN_VALUE = MIN_VALUE;
		/**
		* @alias Long.prototype
		* @inner
		*/
		var LongPrototype = Long.prototype;
		/**
		* Converts the Long to a 32 bit integer, assuming it is a 32 bit integer.
		* @this {!Long}
		* @returns {number}
		*/
		LongPrototype.toInt = function toInt() {
			return this.unsigned ? this.low >>> 0 : this.low;
		};
		/**
		* Converts the Long to a the nearest floating-point representation of this value (double, 53 bit mantissa).
		* @this {!Long}
		* @returns {number}
		*/
		LongPrototype.toNumber = function toNumber() {
			if (this.unsigned) return (this.high >>> 0) * TWO_PWR_32_DBL + (this.low >>> 0);
			return this.high * TWO_PWR_32_DBL + (this.low >>> 0);
		};
		/**
		* Converts the Long to a string written in the specified radix.
		* @this {!Long}
		* @param {number=} radix Radix (2-36), defaults to 10
		* @returns {string}
		* @override
		* @throws {RangeError} If `radix` is out of range
		*/
		LongPrototype.toString = function toString(radix) {
			radix = radix || 10;
			if (radix < 2 || 36 < radix) throw RangeError("radix");
			if (this.isZero()) return "0";
			if (this.isNegative()) {
				if (this.eq(MIN_VALUE)) {
					var radixLong = fromNumber(radix), div = this.div(radixLong), rem1 = div.mul(radixLong).sub(this);
					return div.toString(radix) + rem1.toInt().toString(radix);
				} else return "-" + this.neg().toString(radix);
			}
			var radixToPower = fromNumber(pow_dbl(radix, 6), this.unsigned), rem = this;
			var result = "";
			while (true) {
				var remDiv = rem.div(radixToPower), digits = (rem.sub(remDiv.mul(radixToPower)).toInt() >>> 0).toString(radix);
				rem = remDiv;
				if (rem.isZero()) return digits + result;
				else {
					while (digits.length < 6) digits = "0" + digits;
					result = "" + digits + result;
				}
			}
		};
		/**
		* Gets the high 32 bits as a signed integer.
		* @this {!Long}
		* @returns {number} Signed high bits
		*/
		LongPrototype.getHighBits = function getHighBits() {
			return this.high;
		};
		/**
		* Gets the high 32 bits as an unsigned integer.
		* @this {!Long}
		* @returns {number} Unsigned high bits
		*/
		LongPrototype.getHighBitsUnsigned = function getHighBitsUnsigned() {
			return this.high >>> 0;
		};
		/**
		* Gets the low 32 bits as a signed integer.
		* @this {!Long}
		* @returns {number} Signed low bits
		*/
		LongPrototype.getLowBits = function getLowBits() {
			return this.low;
		};
		/**
		* Gets the low 32 bits as an unsigned integer.
		* @this {!Long}
		* @returns {number} Unsigned low bits
		*/
		LongPrototype.getLowBitsUnsigned = function getLowBitsUnsigned() {
			return this.low >>> 0;
		};
		/**
		* Gets the number of bits needed to represent the absolute value of this Long.
		* @this {!Long}
		* @returns {number}
		*/
		LongPrototype.getNumBitsAbs = function getNumBitsAbs() {
			if (this.isNegative()) return this.eq(MIN_VALUE) ? 64 : this.neg().getNumBitsAbs();
			var val = this.high != 0 ? this.high : this.low;
			for (var bit = 31; bit > 0; bit--) if ((val & 1 << bit) != 0) break;
			return this.high != 0 ? bit + 33 : bit + 1;
		};
		/**
		* Tests if this Long can be safely represented as a JavaScript number.
		* @this {!Long}
		* @returns {boolean}
		*/
		LongPrototype.isSafeInteger = function isSafeInteger() {
			var top11Bits = this.high >> 21;
			if (!top11Bits) return true;
			if (this.unsigned) return false;
			return top11Bits === -1 && !(this.low === 0 && this.high === -2097152);
		};
		/**
		* Tests if this Long's value equals zero.
		* @this {!Long}
		* @returns {boolean}
		*/
		LongPrototype.isZero = function isZero() {
			return this.high === 0 && this.low === 0;
		};
		/**
		* Tests if this Long's value equals zero. This is an alias of {@link Long#isZero}.
		* @returns {boolean}
		*/
		LongPrototype.eqz = LongPrototype.isZero;
		/**
		* Tests if this Long's value is negative.
		* @this {!Long}
		* @returns {boolean}
		*/
		LongPrototype.isNegative = function isNegative() {
			return !this.unsigned && this.high < 0;
		};
		/**
		* Tests if this Long's value is positive or zero.
		* @this {!Long}
		* @returns {boolean}
		*/
		LongPrototype.isPositive = function isPositive() {
			return this.unsigned || this.high >= 0;
		};
		/**
		* Tests if this Long's value is odd.
		* @this {!Long}
		* @returns {boolean}
		*/
		LongPrototype.isOdd = function isOdd() {
			return (this.low & 1) === 1;
		};
		/**
		* Tests if this Long's value is even.
		* @this {!Long}
		* @returns {boolean}
		*/
		LongPrototype.isEven = function isEven() {
			return (this.low & 1) === 0;
		};
		/**
		* Tests if this Long's value equals the specified's.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.equals = function equals(other) {
			if (!isLong(other)) other = fromValue(other);
			if (this.unsigned !== other.unsigned && this.high >>> 31 === 1 && other.high >>> 31 === 1) return false;
			return this.high === other.high && this.low === other.low;
		};
		/**
		* Tests if this Long's value equals the specified's. This is an alias of {@link Long#equals}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.eq = LongPrototype.equals;
		/**
		* Tests if this Long's value differs from the specified's.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.notEquals = function notEquals(other) {
			return !this.eq(other);
		};
		/**
		* Tests if this Long's value differs from the specified's. This is an alias of {@link Long#notEquals}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.neq = LongPrototype.notEquals;
		/**
		* Tests if this Long's value differs from the specified's. This is an alias of {@link Long#notEquals}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.ne = LongPrototype.notEquals;
		/**
		* Tests if this Long's value is less than the specified's.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.lessThan = function lessThan(other) {
			return this.comp(other) < 0;
		};
		/**
		* Tests if this Long's value is less than the specified's. This is an alias of {@link Long#lessThan}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.lt = LongPrototype.lessThan;
		/**
		* Tests if this Long's value is less than or equal the specified's.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.lessThanOrEqual = function lessThanOrEqual(other) {
			return this.comp(other) <= 0;
		};
		/**
		* Tests if this Long's value is less than or equal the specified's. This is an alias of {@link Long#lessThanOrEqual}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.lte = LongPrototype.lessThanOrEqual;
		/**
		* Tests if this Long's value is less than or equal the specified's. This is an alias of {@link Long#lessThanOrEqual}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.le = LongPrototype.lessThanOrEqual;
		/**
		* Tests if this Long's value is greater than the specified's.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.greaterThan = function greaterThan(other) {
			return this.comp(other) > 0;
		};
		/**
		* Tests if this Long's value is greater than the specified's. This is an alias of {@link Long#greaterThan}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.gt = LongPrototype.greaterThan;
		/**
		* Tests if this Long's value is greater than or equal the specified's.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.greaterThanOrEqual = function greaterThanOrEqual(other) {
			return this.comp(other) >= 0;
		};
		/**
		* Tests if this Long's value is greater than or equal the specified's. This is an alias of {@link Long#greaterThanOrEqual}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.gte = LongPrototype.greaterThanOrEqual;
		/**
		* Tests if this Long's value is greater than or equal the specified's. This is an alias of {@link Long#greaterThanOrEqual}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {boolean}
		*/
		LongPrototype.ge = LongPrototype.greaterThanOrEqual;
		/**
		* Compares this Long's value with the specified's.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other value
		* @returns {number} 0 if they are the same, 1 if the this is greater and -1
		*  if the given one is greater
		*/
		LongPrototype.compare = function compare(other) {
			if (!isLong(other)) other = fromValue(other);
			if (this.eq(other)) return 0;
			var thisNeg = this.isNegative(), otherNeg = other.isNegative();
			if (thisNeg && !otherNeg) return -1;
			if (!thisNeg && otherNeg) return 1;
			if (!this.unsigned) return this.sub(other).isNegative() ? -1 : 1;
			return other.high >>> 0 > this.high >>> 0 || other.high === this.high && other.low >>> 0 > this.low >>> 0 ? -1 : 1;
		};
		/**
		* Compares this Long's value with the specified's. This is an alias of {@link Long#compare}.
		* @function
		* @param {!Long|number|bigint|string} other Other value
		* @returns {number} 0 if they are the same, 1 if the this is greater and -1
		*  if the given one is greater
		*/
		LongPrototype.comp = LongPrototype.compare;
		/**
		* Negates this Long's value.
		* @this {!Long}
		* @returns {!Long} Negated Long
		*/
		LongPrototype.negate = function negate() {
			if (!this.unsigned && this.eq(MIN_VALUE)) return MIN_VALUE;
			return this.not().add(ONE);
		};
		/**
		* Negates this Long's value. This is an alias of {@link Long#negate}.
		* @function
		* @returns {!Long} Negated Long
		*/
		LongPrototype.neg = LongPrototype.negate;
		/**
		* Returns the sum of this and the specified Long.
		* @this {!Long}
		* @param {!Long|number|bigint|string} addend Addend
		* @returns {!Long} Sum
		*/
		LongPrototype.add = function add(addend) {
			if (!isLong(addend)) addend = fromValue(addend);
			var a48 = this.high >>> 16;
			var a32 = this.high & 65535;
			var a16 = this.low >>> 16;
			var a00 = this.low & 65535;
			var b48 = addend.high >>> 16;
			var b32 = addend.high & 65535;
			var b16 = addend.low >>> 16;
			var b00 = addend.low & 65535;
			var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
			c00 += a00 + b00;
			c16 += c00 >>> 16;
			c00 &= 65535;
			c16 += a16 + b16;
			c32 += c16 >>> 16;
			c16 &= 65535;
			c32 += a32 + b32;
			c48 += c32 >>> 16;
			c32 &= 65535;
			c48 += a48 + b48;
			c48 &= 65535;
			return fromBits(c16 << 16 | c00, c48 << 16 | c32, this.unsigned);
		};
		/**
		* Returns the difference of this and the specified Long.
		* @this {!Long}
		* @param {!Long|number|bigint|string} subtrahend Subtrahend
		* @returns {!Long} Difference
		*/
		LongPrototype.subtract = function subtract(subtrahend) {
			if (!isLong(subtrahend)) subtrahend = fromValue(subtrahend);
			return this.add(subtrahend.neg());
		};
		/**
		* Returns the difference of this and the specified Long. This is an alias of {@link Long#subtract}.
		* @function
		* @param {!Long|number|bigint|string} subtrahend Subtrahend
		* @returns {!Long} Difference
		*/
		LongPrototype.sub = LongPrototype.subtract;
		/**
		* Returns the product of this and the specified Long.
		* @this {!Long}
		* @param {!Long|number|bigint|string} multiplier Multiplier
		* @returns {!Long} Product
		*/
		LongPrototype.multiply = function multiply(multiplier) {
			if (this.isZero()) return this;
			if (!isLong(multiplier)) multiplier = fromValue(multiplier);
			if (wasm) return fromBits(wasm["mul"](this.low, this.high, multiplier.low, multiplier.high), wasm["get_high"](), this.unsigned);
			if (multiplier.isZero()) return this.unsigned ? UZERO : ZERO;
			if (this.eq(MIN_VALUE)) return multiplier.isOdd() ? MIN_VALUE : ZERO;
			if (multiplier.eq(MIN_VALUE)) return this.isOdd() ? MIN_VALUE : ZERO;
			if (this.isNegative()) {
				if (multiplier.isNegative()) return this.neg().mul(multiplier.neg());
				else return this.neg().mul(multiplier).neg();
			} else if (multiplier.isNegative()) return this.mul(multiplier.neg()).neg();
			if (this.lt(TWO_PWR_24) && multiplier.lt(TWO_PWR_24)) return fromNumber(this.toNumber() * multiplier.toNumber(), this.unsigned);
			var a48 = this.high >>> 16;
			var a32 = this.high & 65535;
			var a16 = this.low >>> 16;
			var a00 = this.low & 65535;
			var b48 = multiplier.high >>> 16;
			var b32 = multiplier.high & 65535;
			var b16 = multiplier.low >>> 16;
			var b00 = multiplier.low & 65535;
			var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
			c00 += a00 * b00;
			c16 += c00 >>> 16;
			c00 &= 65535;
			c16 += a16 * b00;
			c32 += c16 >>> 16;
			c16 &= 65535;
			c16 += a00 * b16;
			c32 += c16 >>> 16;
			c16 &= 65535;
			c32 += a32 * b00;
			c48 += c32 >>> 16;
			c32 &= 65535;
			c32 += a16 * b16;
			c48 += c32 >>> 16;
			c32 &= 65535;
			c32 += a00 * b32;
			c48 += c32 >>> 16;
			c32 &= 65535;
			c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
			c48 &= 65535;
			return fromBits(c16 << 16 | c00, c48 << 16 | c32, this.unsigned);
		};
		/**
		* Returns the product of this and the specified Long. This is an alias of {@link Long#multiply}.
		* @function
		* @param {!Long|number|bigint|string} multiplier Multiplier
		* @returns {!Long} Product
		*/
		LongPrototype.mul = LongPrototype.multiply;
		/**
		* Returns this Long divided by the specified. The result is signed if this Long is signed or
		*  unsigned if this Long is unsigned.
		* @this {!Long}
		* @param {!Long|number|bigint|string} divisor Divisor
		* @returns {!Long} Quotient
		*/
		LongPrototype.divide = function divide(divisor) {
			if (!isLong(divisor)) divisor = fromValue(divisor);
			if (divisor.isZero()) throw Error("division by zero");
			if (wasm) {
				if (!this.unsigned && this.high === -2147483648 && divisor.low === -1 && divisor.high === -1) return this;
				return fromBits((this.unsigned ? wasm["div_u"] : wasm["div_s"])(this.low, this.high, divisor.low, divisor.high), wasm["get_high"](), this.unsigned);
			}
			if (this.isZero()) return this.unsigned ? UZERO : ZERO;
			var approx, rem, res;
			if (!this.unsigned) {
				if (this.eq(MIN_VALUE)) {
					if (divisor.eq(ONE) || divisor.eq(NEG_ONE)) return MIN_VALUE;
					else if (divisor.eq(MIN_VALUE)) return ONE;
					else {
						approx = this.shr(1).div(divisor).shl(1);
						if (approx.eq(ZERO)) return divisor.isNegative() ? ONE : NEG_ONE;
						else {
							rem = this.sub(divisor.mul(approx));
							res = approx.add(rem.div(divisor));
							return res;
						}
					}
				} else if (divisor.eq(MIN_VALUE)) return this.unsigned ? UZERO : ZERO;
				if (this.isNegative()) {
					if (divisor.isNegative()) return this.neg().div(divisor.neg());
					return this.neg().div(divisor).neg();
				} else if (divisor.isNegative()) return this.div(divisor.neg()).neg();
				res = ZERO;
			} else {
				if (!divisor.unsigned) divisor = divisor.toUnsigned();
				if (divisor.gt(this)) return UZERO;
				if (divisor.gt(this.shru(1))) return UONE;
				res = UZERO;
			}
			rem = this;
			while (rem.gte(divisor)) {
				approx = Math.max(1, Math.floor(rem.toNumber() / divisor.toNumber()));
				var log2 = Math.ceil(Math.log(approx) / Math.LN2), delta = log2 <= 48 ? 1 : pow_dbl(2, log2 - 48), approxRes = fromNumber(approx), approxRem = approxRes.mul(divisor);
				while (approxRem.isNegative() || approxRem.gt(rem)) {
					approx -= delta;
					approxRes = fromNumber(approx, this.unsigned);
					approxRem = approxRes.mul(divisor);
				}
				if (approxRes.isZero()) approxRes = ONE;
				res = res.add(approxRes);
				rem = rem.sub(approxRem);
			}
			return res;
		};
		/**
		* Returns this Long divided by the specified. This is an alias of {@link Long#divide}.
		* @function
		* @param {!Long|number|bigint|string} divisor Divisor
		* @returns {!Long} Quotient
		*/
		LongPrototype.div = LongPrototype.divide;
		/**
		* Returns this Long modulo the specified.
		* @this {!Long}
		* @param {!Long|number|bigint|string} divisor Divisor
		* @returns {!Long} Remainder
		*/
		LongPrototype.modulo = function modulo(divisor) {
			if (!isLong(divisor)) divisor = fromValue(divisor);
			if (wasm) return fromBits((this.unsigned ? wasm["rem_u"] : wasm["rem_s"])(this.low, this.high, divisor.low, divisor.high), wasm["get_high"](), this.unsigned);
			return this.sub(this.div(divisor).mul(divisor));
		};
		/**
		* Returns this Long modulo the specified. This is an alias of {@link Long#modulo}.
		* @function
		* @param {!Long|number|bigint|string} divisor Divisor
		* @returns {!Long} Remainder
		*/
		LongPrototype.mod = LongPrototype.modulo;
		/**
		* Returns this Long modulo the specified. This is an alias of {@link Long#modulo}.
		* @function
		* @param {!Long|number|bigint|string} divisor Divisor
		* @returns {!Long} Remainder
		*/
		LongPrototype.rem = LongPrototype.modulo;
		/**
		* Returns the bitwise NOT of this Long.
		* @this {!Long}
		* @returns {!Long}
		*/
		LongPrototype.not = function not() {
			return fromBits(~this.low, ~this.high, this.unsigned);
		};
		/**
		* Returns count leading zeros of this Long.
		* @this {!Long}
		* @returns {!number}
		*/
		LongPrototype.countLeadingZeros = function countLeadingZeros() {
			return this.high ? Math.clz32(this.high) : Math.clz32(this.low) + 32;
		};
		/**
		* Returns count leading zeros. This is an alias of {@link Long#countLeadingZeros}.
		* @function
		* @param {!Long}
		* @returns {!number}
		*/
		LongPrototype.clz = LongPrototype.countLeadingZeros;
		/**
		* Returns count trailing zeros of this Long.
		* @this {!Long}
		* @returns {!number}
		*/
		LongPrototype.countTrailingZeros = function countTrailingZeros() {
			return this.low ? ctz32(this.low) : ctz32(this.high) + 32;
		};
		/**
		* Returns count trailing zeros. This is an alias of {@link Long#countTrailingZeros}.
		* @function
		* @param {!Long}
		* @returns {!number}
		*/
		LongPrototype.ctz = LongPrototype.countTrailingZeros;
		/**
		* Returns the bitwise AND of this Long and the specified.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other Long
		* @returns {!Long}
		*/
		LongPrototype.and = function and(other) {
			if (!isLong(other)) other = fromValue(other);
			return fromBits(this.low & other.low, this.high & other.high, this.unsigned);
		};
		/**
		* Returns the bitwise OR of this Long and the specified.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other Long
		* @returns {!Long}
		*/
		LongPrototype.or = function or(other) {
			if (!isLong(other)) other = fromValue(other);
			return fromBits(this.low | other.low, this.high | other.high, this.unsigned);
		};
		/**
		* Returns the bitwise XOR of this Long and the given one.
		* @this {!Long}
		* @param {!Long|number|bigint|string} other Other Long
		* @returns {!Long}
		*/
		LongPrototype.xor = function xor(other) {
			if (!isLong(other)) other = fromValue(other);
			return fromBits(this.low ^ other.low, this.high ^ other.high, this.unsigned);
		};
		/**
		* Returns this Long with bits shifted to the left by the given amount.
		* @this {!Long}
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Shifted Long
		*/
		LongPrototype.shiftLeft = function shiftLeft(numBits) {
			if (isLong(numBits)) numBits = numBits.toInt();
			if ((numBits &= 63) === 0) return this;
			else if (numBits < 32) return fromBits(this.low << numBits, this.high << numBits | this.low >>> 32 - numBits, this.unsigned);
			else return fromBits(0, this.low << numBits - 32, this.unsigned);
		};
		/**
		* Returns this Long with bits shifted to the left by the given amount. This is an alias of {@link Long#shiftLeft}.
		* @function
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Shifted Long
		*/
		LongPrototype.shl = LongPrototype.shiftLeft;
		/**
		* Returns this Long with bits arithmetically shifted to the right by the given amount.
		* @this {!Long}
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Shifted Long
		*/
		LongPrototype.shiftRight = function shiftRight(numBits) {
			if (isLong(numBits)) numBits = numBits.toInt();
			if ((numBits &= 63) === 0) return this;
			else if (numBits < 32) return fromBits(this.low >>> numBits | this.high << 32 - numBits, this.high >> numBits, this.unsigned);
			else return fromBits(this.high >> numBits - 32, this.high >= 0 ? 0 : -1, this.unsigned);
		};
		/**
		* Returns this Long with bits arithmetically shifted to the right by the given amount. This is an alias of {@link Long#shiftRight}.
		* @function
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Shifted Long
		*/
		LongPrototype.shr = LongPrototype.shiftRight;
		/**
		* Returns this Long with bits logically shifted to the right by the given amount.
		* @this {!Long}
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Shifted Long
		*/
		LongPrototype.shiftRightUnsigned = function shiftRightUnsigned(numBits) {
			if (isLong(numBits)) numBits = numBits.toInt();
			if ((numBits &= 63) === 0) return this;
			if (numBits < 32) return fromBits(this.low >>> numBits | this.high << 32 - numBits, this.high >>> numBits, this.unsigned);
			if (numBits === 32) return fromBits(this.high, 0, this.unsigned);
			return fromBits(this.high >>> numBits - 32, 0, this.unsigned);
		};
		/**
		* Returns this Long with bits logically shifted to the right by the given amount. This is an alias of {@link Long#shiftRightUnsigned}.
		* @function
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Shifted Long
		*/
		LongPrototype.shru = LongPrototype.shiftRightUnsigned;
		/**
		* Returns this Long with bits logically shifted to the right by the given amount. This is an alias of {@link Long#shiftRightUnsigned}.
		* @function
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Shifted Long
		*/
		LongPrototype.shr_u = LongPrototype.shiftRightUnsigned;
		/**
		* Returns this Long with bits rotated to the left by the given amount.
		* @this {!Long}
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Rotated Long
		*/
		LongPrototype.rotateLeft = function rotateLeft(numBits) {
			var b;
			if (isLong(numBits)) numBits = numBits.toInt();
			if ((numBits &= 63) === 0) return this;
			if (numBits === 32) return fromBits(this.high, this.low, this.unsigned);
			if (numBits < 32) {
				b = 32 - numBits;
				return fromBits(this.low << numBits | this.high >>> b, this.high << numBits | this.low >>> b, this.unsigned);
			}
			numBits -= 32;
			b = 32 - numBits;
			return fromBits(this.high << numBits | this.low >>> b, this.low << numBits | this.high >>> b, this.unsigned);
		};
		/**
		* Returns this Long with bits rotated to the left by the given amount. This is an alias of {@link Long#rotateLeft}.
		* @function
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Rotated Long
		*/
		LongPrototype.rotl = LongPrototype.rotateLeft;
		/**
		* Returns this Long with bits rotated to the right by the given amount.
		* @this {!Long}
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Rotated Long
		*/
		LongPrototype.rotateRight = function rotateRight(numBits) {
			var b;
			if (isLong(numBits)) numBits = numBits.toInt();
			if ((numBits &= 63) === 0) return this;
			if (numBits === 32) return fromBits(this.high, this.low, this.unsigned);
			if (numBits < 32) {
				b = 32 - numBits;
				return fromBits(this.high << b | this.low >>> numBits, this.low << b | this.high >>> numBits, this.unsigned);
			}
			numBits -= 32;
			b = 32 - numBits;
			return fromBits(this.low << b | this.high >>> numBits, this.high << b | this.low >>> numBits, this.unsigned);
		};
		/**
		* Returns this Long with bits rotated to the right by the given amount. This is an alias of {@link Long#rotateRight}.
		* @function
		* @param {number|!Long} numBits Number of bits
		* @returns {!Long} Rotated Long
		*/
		LongPrototype.rotr = LongPrototype.rotateRight;
		/**
		* Converts this Long to signed.
		* @this {!Long}
		* @returns {!Long} Signed long
		*/
		LongPrototype.toSigned = function toSigned() {
			if (!this.unsigned) return this;
			return fromBits(this.low, this.high, false);
		};
		/**
		* Converts this Long to unsigned.
		* @this {!Long}
		* @returns {!Long} Unsigned long
		*/
		LongPrototype.toUnsigned = function toUnsigned() {
			if (this.unsigned) return this;
			return fromBits(this.low, this.high, true);
		};
		/**
		* Converts this Long to its byte representation.
		* @param {boolean=} le Whether little or big endian, defaults to big endian
		* @this {!Long}
		* @returns {!Array.<number>} Byte representation
		*/
		LongPrototype.toBytes = function toBytes(le) {
			return le ? this.toBytesLE() : this.toBytesBE();
		};
		/**
		* Converts this Long to its little endian byte representation.
		* @this {!Long}
		* @returns {!Array.<number>} Little endian byte representation
		*/
		LongPrototype.toBytesLE = function toBytesLE() {
			var hi = this.high, lo = this.low;
			return [
				lo & 255,
				lo >>> 8 & 255,
				lo >>> 16 & 255,
				lo >>> 24,
				hi & 255,
				hi >>> 8 & 255,
				hi >>> 16 & 255,
				hi >>> 24
			];
		};
		/**
		* Converts this Long to its big endian byte representation.
		* @this {!Long}
		* @returns {!Array.<number>} Big endian byte representation
		*/
		LongPrototype.toBytesBE = function toBytesBE() {
			var hi = this.high, lo = this.low;
			return [
				hi >>> 24,
				hi >>> 16 & 255,
				hi >>> 8 & 255,
				hi & 255,
				lo >>> 24,
				lo >>> 16 & 255,
				lo >>> 8 & 255,
				lo & 255
			];
		};
		/**
		* Creates a Long from its byte representation.
		* @param {!Array.<number>} bytes Byte representation
		* @param {boolean=} unsigned Whether unsigned or not, defaults to signed
		* @param {boolean=} le Whether little or big endian, defaults to big endian
		* @returns {Long} The corresponding Long value
		*/
		Long.fromBytes = function fromBytes(bytes, unsigned, le) {
			return le ? Long.fromBytesLE(bytes, unsigned) : Long.fromBytesBE(bytes, unsigned);
		};
		/**
		* Creates a Long from its little endian byte representation.
		* @param {!Array.<number>} bytes Little endian byte representation
		* @param {boolean=} unsigned Whether unsigned or not, defaults to signed
		* @returns {Long} The corresponding Long value
		*/
		Long.fromBytesLE = function fromBytesLE(bytes, unsigned) {
			return new Long(bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24, bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24, unsigned);
		};
		/**
		* Creates a Long from its big endian byte representation.
		* @param {!Array.<number>} bytes Big endian byte representation
		* @param {boolean=} unsigned Whether unsigned or not, defaults to signed
		* @returns {Long} The corresponding Long value
		*/
		Long.fromBytesBE = function fromBytesBE(bytes, unsigned) {
			return new Long(bytes[4] << 24 | bytes[5] << 16 | bytes[6] << 8 | bytes[7], bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3], unsigned);
		};
		if (typeof BigInt === "function") {
			/**
			* Returns a Long representing the given big integer.
			* @function
			* @param {number} value The big integer value
			* @param {boolean=} unsigned Whether unsigned or not, defaults to signed
			* @returns {!Long} The corresponding Long value
			*/
			Long.fromBigInt = function fromBigInt(value, unsigned) {
				return fromBits(Number(BigInt.asIntN(32, value)), Number(BigInt.asIntN(32, value >> BigInt(32))), unsigned);
			};
			Long.fromValue = function fromValueWithBigInt(value, unsigned) {
				if (typeof value === "bigint") return Long.fromBigInt(value, unsigned);
				return fromValue(value, unsigned);
			};
			/**
			* Converts the Long to its big integer representation.
			* @this {!Long}
			* @returns {bigint}
			*/
			LongPrototype.toBigInt = function toBigInt() {
				var lowBigInt = BigInt(this.low >>> 0);
				return BigInt(this.unsigned ? this.high >>> 0 : this.high) << BigInt(32) | lowBigInt;
			};
		}
		_exports.default = Long;
	});
}));
//#endregion
//#region node_modules/protobufjs/src/util/minimal.js
var require_minimal = /* @__PURE__ */ __commonJSMin(((exports) => {
	var util = exports;
	util.asPromise = require_aspromise();
	util.base64 = require_base64();
	util.EventEmitter = require_eventemitter();
	util.float = require_float();
	util.utf8 = require_utf8();
	util.pool = require_pool();
	util.LongBits = require_longbits();
	/**
	* Tests if the specified key can affect object prototypes.
	* @memberof util
	* @param {string} key Key to test
	* @returns {boolean} `true` if the key is unsafe
	*/
	function isUnsafeProperty(key) {
		return key === "__proto__" || key === "prototype" || key === "constructor";
	}
	util.isUnsafeProperty = isUnsafeProperty;
	/**
	* Whether running within node or not.
	* @memberof util
	* @type {boolean}
	*/
	util.isNode = Boolean(typeof global !== "undefined" && global && global.process && global.process.versions && global.process.versions.node);
	/**
	* Global object reference.
	* @memberof util
	* @type {Object}
	*/
	util.global = util.isNode && global || typeof window !== "undefined" && window || typeof self !== "undefined" && self || typeof globalThis !== "undefined" && globalThis || exports;
	/**
	* An immuable empty array.
	* @memberof util
	* @type {Array.<*>}
	* @const
	*/
	util.emptyArray = Object.freeze ? Object.freeze([]) : /* istanbul ignore next */ [];
	/**
	* An immutable empty object.
	* @type {Object}
	* @const
	*/
	util.emptyObject = Object.freeze ? Object.freeze({}) : /* istanbul ignore next */ {};
	/**
	* Tests if the specified value is an integer.
	* @function
	* @param {*} value Value to test
	* @returns {boolean} `true` if the value is an integer
	*/
	util.isInteger = Number.isInteger || /* istanbul ignore next */ function isInteger(value) {
		return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
	};
	/**
	* Tests if the specified value is a string.
	* @param {*} value Value to test
	* @returns {boolean} `true` if the value is a string
	*/
	util.isString = function isString(value) {
		return typeof value === "string" || value instanceof String;
	};
	/**
	* Tests if the specified value is a non-null object.
	* @param {*} value Value to test
	* @returns {boolean} `true` if the value is a non-null object
	*/
	util.isObject = function isObject(value) {
		return value && typeof value === "object";
	};
	/**
	* Checks if a property on a message is considered to be present.
	* This is an alias of {@link util.isSet}.
	* @function
	* @param {Object} obj Plain object or message instance
	* @param {string} prop Property name
	* @returns {boolean} `true` if considered to be present, otherwise `false`
	*/
	util.isset = util.isSet = function isSet(obj, prop) {
		var value = obj[prop];
		if (value != null && Object.hasOwnProperty.call(obj, prop)) return typeof value !== "object" || (Array.isArray(value) ? value.length : Object.keys(value).length) > 0;
		return false;
	};
	/**
	* Any compatible Buffer instance.
	* This is a minimal stand-alone definition of a Buffer instance. The actual type is that exported by node's typings.
	* @interface Buffer
	* @extends Uint8Array
	*/
	/**
	* Node's Buffer class if available.
	* @type {Constructor<Buffer>}
	*/
	util.Buffer = (function() {
		try {
			var Buffer = util.global.Buffer;
			return Buffer.prototype.utf8Write || util.isNode ? Buffer : /* istanbul ignore next */ null;
		} catch (e) {
			/* istanbul ignore next */
			return null;
		}
	})();
	/**
	* Creates a new buffer of whatever type supported by the environment.
	* @param {number|number[]} [sizeOrArray=0] Buffer size or number array
	* @returns {Uint8Array|Buffer} Buffer
	*/
	util.newBuffer = function newBuffer(sizeOrArray) {
		var Buffer = util.Buffer;
		/* istanbul ignore next */
		return typeof sizeOrArray === "number" ? Buffer ? Buffer.allocUnsafe(sizeOrArray) : new Uint8Array(sizeOrArray) : Buffer ? Buffer.from(sizeOrArray) : new Uint8Array(sizeOrArray);
	};
	/**
	* Prepends a raw field tag to raw field data.
	* @param {number} id Field id
	* @param {number} wireType Wire type
	* @param {Uint8Array} data Raw field data
	* @returns {Uint8Array|Buffer} Raw field bytes
	* @ignore
	*/
	util.rawField = function rawField(id, wireType, data) {
		var out = [], tag = id << 3 | wireType;
		tag >>>= 0;
		while (tag > 127) {
			out.push(tag & 127 | 128);
			tag >>>= 7;
		}
		out.push(tag);
		for (var i = 0; i < data.length; ++i) out.push(data[i]);
		return util.newBuffer(out);
	};
	/**
	* Array implementation used in the browser.
	* @type {Constructor<Uint8Array>}
	* @deprecated Use `Uint8Array` instead.
	*/
	util.Array = Uint8Array;
	/**
	* Any compatible Long instance.
	* This is a minimal stand-alone definition of a Long instance. The actual type is that exported by long.js.
	* @interface Long
	* @property {number} low Low bits
	* @property {number} high High bits
	* @property {boolean} unsigned Whether unsigned or not
	*/
	/**
	* Long.js's Long class if available.
	* @type {Constructor<Long>}
	*/
	util.Long = util.global.dcodeIO && /* istanbul ignore next */ util.global.dcodeIO.Long || /* istanbul ignore next */ util.global.Long || (function() {
		try {
			var Long = require_umd();
			return Long && Long.isLong ? Long : null;
		} catch (e) {
			/* istanbul ignore next */
			return null;
		}
	})();
	/**
	* Regular expression used to verify 2 bit (`bool`) map keys.
	* @type {RegExp}
	* @const
	*/
	util.key2Re = /^(?:true|false|0|1)$/;
	/**
	* Regular expression used to verify 32 bit (`int32` etc.) map keys.
	* @type {RegExp}
	* @const
	*/
	util.key32Re = /^-?(?:0|[1-9][0-9]*)$/;
	/**
	* Regular expression used to verify 64 bit (`int64` etc.) map keys.
	* @type {RegExp}
	* @const
	*/
	util.key64Re = /^(?:[\x00-\xff]{8}|-?(?:0|[1-9][0-9]*))$/;
	/**
	* Converts a number or long to an 8 characters long hash string.
	* @param {Long|number} value Value to convert
	* @returns {string} Hash
	*/
	util.longToHash = function longToHash(value) {
		return value ? util.LongBits.from(value).toHash() : util.LongBits.zeroHash;
	};
	/**
	* Converts an 8 characters long hash string to a long or number.
	* @param {string} hash Hash
	* @param {boolean} [unsigned=false] Whether unsigned or not
	* @returns {Long|number} Original value
	*/
	util.longFromHash = function longFromHash(hash, unsigned) {
		var bits = util.LongBits.fromHash(hash);
		if (util.Long) return util.Long.fromBits(bits.lo, bits.hi, unsigned);
		return bits.toNumber(Boolean(unsigned));
	};
	/**
	* Converts a 64 bit key to a long or number if it is an 8 characters long hash string.
	* @param {string} key Map key
	* @param {boolean} [unsigned=false] Whether unsigned or not
	* @returns {Long|number|string} Original value
	*/
	util.longFromKey = function longFromKey(key, unsigned) {
		return util.key64Re.test(key) && !util.key32Re.test(key) ? util.longFromHash(key, unsigned) : key;
	};
	/**
	* Converts a boolean key to a boolean value.
	* @param {string} key Map key
	* @returns {boolean} Boolean value
	*/
	util.boolFromKey = function boolFromKey(key) {
		return key === "true" || key === "1";
	};
	/**
	* Merges the properties of the source object into the destination object.
	* @memberof util
	* @param {Object.<string,*>} dst Destination object
	* @param {...(Object.<string,*>|boolean)} src Source objects, optionally followed by an `ifNotSet` flag
	* @returns {Object.<string,*>} Destination object
	*/
	function merge(dst) {
		var ifNotSet = typeof arguments[arguments.length - 1] === "boolean", limit = ifNotSet ? arguments.length - 1 : arguments.length;
		ifNotSet = ifNotSet && arguments[arguments.length - 1];
		for (var a = 1; a < limit; ++a) {
			var src = arguments[a];
			if (!src) continue;
			for (var keys = Object.keys(src), i = 0; i < keys.length; ++i) if (!isUnsafeProperty(keys[i]) && (!ifNotSet || !Object.prototype.hasOwnProperty.call(dst, keys[i]) || dst[keys[i]] === void 0)) dst[keys[i]] = src[keys[i]];
		}
		return dst;
	}
	util.merge = merge;
	/**
	* Schema declaration nesting limit.
	* @memberof util
	* @type {number}
	*/
	util.nestingLimit = 32;
	/**
	* Recursion limit.
	* @memberof util
	* @type {number}
	*/
	util.recursionLimit = 100;
	/**
	* Makes a property safe for assignment as an own property.
	* @memberof util
	* @param {Object.<string,*>} obj Object
	* @param {string} key Property key
	* @param {boolean} [enumerable=true] Whether the property should be enumerable
	* @returns {undefined}
	*/
	util.makeProp = function makeProp(obj, key, enumerable) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) return;
		Object.defineProperty(obj, key, {
			enumerable: enumerable === void 0 ? true : enumerable,
			configurable: true,
			writable: true
		});
	};
	/**
	* Converts the first character of a string to lower case.
	* @param {string} str String to convert
	* @returns {string} Converted string
	*/
	util.lcFirst = function lcFirst(str) {
		return str.charAt(0).toLowerCase() + str.substring(1);
	};
	/**
	* Creates a custom error constructor.
	* @memberof util
	* @param {string} name Error name
	* @returns {Constructor<Error>} Custom error constructor
	*/
	function newError(name) {
		function CustomError(message, properties) {
			if (!(this instanceof CustomError)) return new CustomError(message, properties);
			Object.defineProperty(this, "message", { get: function() {
				return message;
			} });
			/* istanbul ignore next */
			if (Error.captureStackTrace) Error.captureStackTrace(this, CustomError);
			else Object.defineProperty(this, "stack", { value: (/* @__PURE__ */ new Error()).stack || "" });
			if (properties) merge(this, properties);
		}
		CustomError.prototype = Object.create(Error.prototype, {
			constructor: {
				value: CustomError,
				writable: true,
				enumerable: false,
				configurable: true
			},
			name: {
				get: function get() {
					return name;
				},
				set: void 0,
				enumerable: false,
				configurable: true
			},
			toString: {
				value: function value() {
					return this.name + ": " + this.message;
				},
				writable: true,
				enumerable: false,
				configurable: true
			}
		});
		return CustomError;
	}
	util.newError = newError;
	/**
	* Constructs a new protocol error.
	* @classdesc Error subclass indicating a protocol specifc error.
	* @memberof util
	* @extends Error
	* @template T extends Message<T>
	* @constructor
	* @param {string} message Error message
	* @param {Object.<string,*>} [properties] Additional properties
	* @example
	* try {
	*     MyMessage.decode(someBuffer); // throws if required fields are missing
	* } catch (e) {
	*     if (e instanceof ProtocolError && e.instance)
	*         console.log("decoded so far: " + JSON.stringify(e.instance));
	* }
	*/
	util.ProtocolError = newError("ProtocolError");
	/**
	* So far decoded message instance.
	* @name util.ProtocolError#instance
	* @type {Message<T>}
	*/
	/**
	* A OneOf getter as returned by {@link util.oneOfGetter}.
	* @typedef OneOfGetter
	* @type {function}
	* @returns {string|undefined} Set field name, if any
	*/
	/**
	* Builds a getter for a oneof's present field name.
	* @param {string[]} fieldNames Field names
	* @returns {OneOfGetter} Unbound getter
	*/
	util.oneOfGetter = function getOneOf(fieldNames) {
		var fieldMap = {};
		for (var i = 0; i < fieldNames.length; ++i) fieldMap[fieldNames[i]] = 1;
		/**
		* @returns {string|undefined} Set field name, if any
		* @this Object
		* @ignore
		*/
		return function() {
			for (var keys = Object.keys(this), i = keys.length - 1; i > -1; --i) if (fieldMap[keys[i]] === 1 && this[keys[i]] !== void 0 && this[keys[i]] !== null) return keys[i];
		};
	};
	/**
	* A OneOf setter as returned by {@link util.oneOfSetter}.
	* @typedef OneOfSetter
	* @type {function}
	* @param {string|undefined} value Field name
	* @returns {undefined}
	*/
	/**
	* Builds a setter for a oneof's present field name.
	* @param {string[]} fieldNames Field names
	* @returns {OneOfSetter} Unbound setter
	*/
	util.oneOfSetter = function setOneOf(fieldNames) {
		/**
		* @param {string} name Field name
		* @returns {undefined}
		* @this Object
		* @ignore
		*/
		return function(name) {
			for (var i = 0; i < fieldNames.length; ++i) if (fieldNames[i] !== name) delete this[fieldNames[i]];
		};
	};
	/**
	* Default conversion options used for {@link Message#toJSON} implementations.
	*
	* These options are close to proto3's JSON mapping with the exception that internal types like Any are handled just like messages. More precisely:
	*
	* - Longs become strings
	* - Enums become string keys
	* - Bytes become base64 encoded strings
	* - (Sub-)Messages become plain objects
	* - Maps become plain objects with all string keys
	* - Repeated fields become arrays
	* - NaN and Infinity for float and double fields become strings
	*
	* @type {IConversionOptions}
	* @see https://developers.google.com/protocol-buffers/docs/proto3?hl=en#json
	*/
	util.toJSONOptions = {
		longs: String,
		enums: String,
		bytes: String,
		json: true
	};
}));
//#endregion
//#region node_modules/protobufjs/src/writer.js
var require_writer = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Writer;
	var util = require_minimal();
	var BufferWriter;
	var LongBits = util.LongBits;
	var base64 = util.base64;
	var utf8 = util.utf8;
	/**
	* Constructs a new writer instance.
	* @classdesc Wire format writer using `Uint8Array`.
	* @constructor
	*/
	function Writer() {
		/**
		* Write cursor into {@link Writer#buf}.
		* @type {number}
		*/
		this.pos = 0;
		/**
		* Backing buffer.
		* @type {Uint8Array}
		*/
		this.buf = this.constructor.alloc(Writer.initialBufferSize);
		/**
		* Cached DataView over {@link Writer#buf}.
		* @type {DataView|null}
		*/
		this.view = null;
		/**
		* Stack of forked length-prefix positions.
		* @type {Array<number>|null}
		*/
		this.states = null;
	}
	/**
	* Initial backing buffer size in bytes. Defaults to 128.
	* @type {number}
	*/
	Writer.initialBufferSize = 128;
	/**
	* Current write position.
	* @name Writer#len
	* @type {number}
	* @deprecated Use {@link Writer#pos} instead.
	*/
	Object.defineProperty(Writer.prototype, "len", {
		configurable: true,
		enumerable: true,
		get: function get_len() {
			return this.pos;
		}
	});
	var create = function create() {
		return util.Buffer ? function create_buffer_setup() {
			return (Writer.create = function create_buffer() {
				return new BufferWriter();
			})();
		} : function create_array() {
			return new Writer();
		};
	};
	/**
	* Creates a new writer.
	* @function
	* @returns {BufferWriter|Writer} A {@link BufferWriter} when Buffers are supported, otherwise a {@link Writer}
	*/
	Writer.create = create();
	/**
	* Allocates a buffer of the specified size.
	* @param {number} size Buffer size
	* @returns {Uint8Array} Buffer
	*/
	Writer.alloc = function alloc(size) {
		return new Uint8Array(size);
	};
	Writer.alloc = util.pool(Writer.alloc, Uint8Array.prototype.subarray);
	/**
	* Calculates the number of bytes a value occupies as a varint.
	* @param {number} value Value to size (unsigned)
	* @returns {number} Byte length (1..5)
	* @ignore
	*/
	function sizeVarint32(value) {
		return value < 128 ? 1 : value < 16384 ? 2 : value < 2097152 ? 3 : value < 268435456 ? 4 : 5;
	}
	/**
	* Ensures that at least `n` more bytes fit into the backing buffer, doubling it if not.
	* @param {number} n Number of additional bytes required
	* @returns {undefined}
	* @private
	*/
	Writer.prototype._reserve = function _reserve(n) {
		var need = this.pos + n;
		if (need > this.buf.length) {
			var size = this.buf.length << 1;
			if (size < need) size = need;
			var buf = this.constructor.alloc(size);
			buf.set(this.buf.subarray(0, this.pos), 0);
			this.buf = buf;
			this.view = null;
		}
	};
	function writeStringAscii(val, buf, pos) {
		for (var i = 0; i < val.length;) buf[pos++] = val.charCodeAt(i++);
	}
	function writeVarint32(val, buf, pos) {
		while (val > 127) {
			buf[pos++] = val & 127 | 128;
			val >>>= 7;
		}
		buf[pos] = val;
		return pos + 1;
	}
	/**
	* Writes an unsigned 32 bit value as a varint.
	* @param {number} value Value to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.uint32 = function write_uint32(value) {
		value = value >>> 0;
		this._reserve(5);
		var pos = this.pos;
		this.pos = writeVarint32(value, this.buf, pos);
		return this;
	};
	/**
	* Writes a signed 32 bit value as a varint.
	* @function
	* @param {number} value Value to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.int32 = function write_int32(value) {
		if ((value |= 0) < 0) {
			this._reserve(10);
			writeVarint64(LongBits.fromNumber(value), this.buf, this.pos);
			this.pos += 10;
			return this;
		}
		return this.uint32(value);
	};
	/**
	* Writes a 32 bit value as a varint, zig-zag encoded.
	* @param {number} value Value to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.sint32 = function write_sint32(value) {
		return this.uint32((value << 1 ^ value >> 31) >>> 0);
	};
	function writeVarint64(val, buf, pos) {
		var lo = val.lo, hi = val.hi;
		while (hi) {
			buf[pos++] = lo & 127 | 128;
			lo = (lo >>> 7 | hi << 25) >>> 0;
			hi >>>= 7;
		}
		while (lo > 127) {
			buf[pos++] = lo & 127 | 128;
			lo = lo >>> 7;
		}
		buf[pos] = lo;
		return pos + 1;
	}
	/**
	* Writes an unsigned 64 bit value as a varint.
	* @param {Long|number|string} value Value to write
	* @returns {Writer} `this`
	* @throws {TypeError} If `value` is a string and no long library is present.
	*/
	Writer.prototype.uint64 = function write_uint64(value) {
		var bits = LongBits.from(value);
		this._reserve(10);
		var pos = this.pos;
		this.pos = writeVarint64(bits, this.buf, pos);
		return this;
	};
	/**
	* Writes a signed 64 bit value as a varint.
	* @function
	* @param {Long|number|string} value Value to write
	* @returns {Writer} `this`
	* @throws {TypeError} If `value` is a string and no long library is present.
	*/
	Writer.prototype.int64 = Writer.prototype.uint64;
	/**
	* Writes a signed 64 bit value as a varint, zig-zag encoded.
	* @param {Long|number|string} value Value to write
	* @returns {Writer} `this`
	* @throws {TypeError} If `value` is a string and no long library is present.
	*/
	Writer.prototype.sint64 = function write_sint64(value) {
		var bits = LongBits.from(value).zzEncode();
		this._reserve(10);
		var pos = this.pos;
		this.pos = writeVarint64(bits, this.buf, pos);
		return this;
	};
	/**
	* Writes a boolish value as a varint.
	* @param {boolean} value Value to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.bool = function write_bool(value) {
		this._reserve(1);
		this.buf[this.pos++] = value ? 1 : 0;
		return this;
	};
	function writeFixed32(val, buf, pos) {
		buf[pos] = val & 255;
		buf[pos + 1] = val >>> 8 & 255;
		buf[pos + 2] = val >>> 16 & 255;
		buf[pos + 3] = val >>> 24;
	}
	/**
	* Writes an unsigned 32 bit value as fixed 32 bits.
	* @param {number} value Value to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.fixed32 = function write_fixed32(value) {
		this._reserve(4);
		writeFixed32(value >>> 0, this.buf, this.pos);
		this.pos += 4;
		return this;
	};
	/**
	* Writes a signed 32 bit value as fixed 32 bits.
	* @function
	* @param {number} value Value to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.sfixed32 = Writer.prototype.fixed32;
	/**
	* Writes an unsigned 64 bit value as fixed 64 bits.
	* @param {Long|number|string} value Value to write
	* @returns {Writer} `this`
	* @throws {TypeError} If `value` is a string and no long library is present.
	*/
	Writer.prototype.fixed64 = function write_fixed64(value) {
		var bits = LongBits.from(value);
		this._reserve(8);
		writeFixed32(bits.lo, this.buf, this.pos);
		writeFixed32(bits.hi, this.buf, this.pos + 4);
		this.pos += 8;
		return this;
	};
	/**
	* Writes a signed 64 bit value as fixed 64 bits.
	* @function
	* @param {Long|number|string} value Value to write
	* @returns {Writer} `this`
	* @throws {TypeError} If `value` is a string and no long library is present.
	*/
	Writer.prototype.sfixed64 = Writer.prototype.fixed64;
	/**
	* Writes a float (32 bit).
	* @function
	* @param {number} value Value to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.float = function write_float(value) {
		this._reserve(4);
		util.float.writeFloatLE(value, this.buf, this.pos);
		this.pos += 4;
		return this;
	};
	/**
	* Writes a double (64 bit float).
	* @function
	* @param {number} value Value to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.double = function write_double(value) {
		this._reserve(8);
		util.float.writeDoubleLE(value, this.buf, this.pos);
		this.pos += 8;
		return this;
	};
	/**
	* Writes a sequence of bytes.
	* @param {Uint8Array|string} value Buffer or base64 encoded string to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.bytes = function write_bytes(value) {
		var len = value.length >>> 0;
		if (!len) {
			this._reserve(1);
			this.buf[this.pos++] = 0;
			return this;
		}
		if (util.isString(value)) {
			var buf = Writer.alloc(len = base64.length(value));
			base64.decode(value, buf, 0);
			value = buf;
		}
		this.uint32(len);
		this._reserve(len);
		this.buf.set(value, this.pos);
		this.pos += len;
		return this;
	};
	/**
	* Writes raw bytes without a tag or length prefix.
	* @param {Uint8Array} value Raw bytes
	* @returns {Writer} `this`
	*/
	Writer.prototype.raw = function write_raw(value) {
		var len = value.length >>> 0;
		if (!len) return this;
		this._reserve(len);
		this.buf.set(value, this.pos);
		this.pos += len;
		return this;
	};
	/**
	* Backfills the length varint.
	* @param {number} pos Position of reserved length byte
	* @param {number} len Length of content after length varint
	* @returns {Writer} `this`
	* @private
	*/
	Writer.prototype._delim = function _delim(pos, len) {
		var n = sizeVarint32(len);
		if (n > 1) this.buf.copyWithin(pos + n, pos + 1, pos + 1 + len);
		writeVarint32(len, this.buf, pos);
		this.pos = pos + n + len;
		return this;
	};
	/**
	* Writes a string.
	* @param {string} value Value to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.string = function write_string(value) {
		var n = value.length;
		if (!n) {
			this._reserve(1);
			this.buf[this.pos++] = 0;
			return this;
		}
		if (n < 128) {
			this._reserve(n * 3 + 5);
			var lenPos = this.pos;
			return this._delim(lenPos, utf8.write(value, this.buf, lenPos + 1));
		}
		var len = utf8.length(value);
		this.uint32(len);
		this._reserve(len);
		if (len === value.length) writeStringAscii(value, this.buf, this.pos);
		else utf8.write(value, this.buf, this.pos);
		this.pos += len;
		return this;
	};
	/**
	* Writes an array of unsigned 32 bit values as a packed repeated field.
	* @param {number[]} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.uint32s = function write_uint32s(value) {
		var n = value.length;
		this._reserve(n * 5 + 5);
		var buf = this.buf, lenPos = this.pos, p = lenPos + 1;
		for (var i = 0; i < n; ++i) p = writeVarint32(value[i] >>> 0, buf, p);
		return this._delim(lenPos, p - lenPos - 1);
	};
	/**
	* Writes an array of signed 32 bit values as a packed repeated field.
	* @param {number[]} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.int32s = function write_int32s(value) {
		var n = value.length;
		this._reserve(n * 10 + 5);
		var buf = this.buf, lenPos = this.pos, pos = lenPos + 1, val;
		for (var i = 0; i < n; ++i) if ((val = value[i] | 0) < 0) pos = writeVarint64(LongBits.fromNumber(val), buf, pos);
		else pos = writeVarint32(val, buf, pos);
		return this._delim(lenPos, pos - lenPos - 1);
	};
	/**
	* Writes an array of 32 bit values as packed, zig-zag encoded varints.
	* @param {number[]} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.sint32s = function write_sint32s(value) {
		var n = value.length;
		this._reserve(n * 5 + 5);
		var buf = this.buf, lenPos = this.pos, pos = lenPos + 1;
		for (var i = 0; i < n; ++i) pos = writeVarint32((value[i] << 1 ^ value[i] >> 31) >>> 0, buf, pos);
		return this._delim(lenPos, pos - lenPos - 1);
	};
	/**
	* Writes an array of unsigned 64 bit values as a packed repeated field.
	* @param {Array.<Long|number|string>} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.uint64s = function write_uint64s(value) {
		var n = value.length;
		this._reserve(n * 10 + 5);
		var buf = this.buf, lenPos = this.pos, pos = lenPos + 1;
		for (var i = 0; i < n; ++i) pos = writeVarint64(LongBits.from(value[i]), buf, pos);
		return this._delim(lenPos, pos - lenPos - 1);
	};
	/**
	* Writes an array of signed 64 bit values as a packed repeated field.
	* @function
	* @param {Array.<Long|number|string>} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.int64s = Writer.prototype.uint64s;
	/**
	* Writes an array of 64 bit values as packed, zig-zag encoded varints.
	* @param {Array.<Long|number|string>} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.sint64s = function write_sint64s(value) {
		var n = value.length;
		this._reserve(n * 10 + 5);
		var buf = this.buf, lenPos = this.pos, pos = lenPos + 1;
		for (var i = 0; i < n; ++i) pos = writeVarint64(LongBits.from(value[i]).zzEncode(), buf, pos);
		return this._delim(lenPos, pos - lenPos - 1);
	};
	/**
	* Writes an array of boolish values as a packed repeated field.
	* @param {boolean[]} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.bools = function write_bools(value) {
		var n = value.length;
		this.uint32(n);
		this._reserve(n);
		var buf = this.buf, p = this.pos;
		for (var i = 0; i < n; ++i) buf[p++] = value[i] ? 1 : 0;
		this.pos += n;
		return this;
	};
	var VIEW_THRESHOLD_FLOAT = 16;
	var VIEW_THRESHOLD_INT = 128;
	function getLazyView(writer, count, threshold) {
		var view = writer.view;
		if (view || count < threshold) return view;
		var buf = writer.buf;
		return writer.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	}
	/**
	* Writes an array of unsigned 32 bit values as packed, fixed 32 bits.
	* @param {number[]} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.fixed32s = function write_fixed32s(value) {
		var n = value.length, bytes = n * 4;
		this.uint32(bytes);
		this._reserve(bytes);
		var p = this.pos, i, dv = getLazyView(this, n, VIEW_THRESHOLD_INT);
		if (dv) for (i = 0; i < n; ++i) {
			dv.setUint32(p, value[i] >>> 0, true);
			p += 4;
		}
		else {
			var buf = this.buf;
			for (i = 0; i < n; ++i) {
				writeFixed32(value[i] >>> 0, buf, p);
				p += 4;
			}
		}
		this.pos += bytes;
		return this;
	};
	/**
	* Writes an array of signed 32 bit values as packed, fixed 32 bits.
	* @function
	* @param {number[]} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.sfixed32s = Writer.prototype.fixed32s;
	/**
	* Writes an array of unsigned 64 bit values as packed, fixed 64 bits.
	* @param {Array.<Long|number|string>} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.fixed64s = function write_fixed64s(value) {
		var n = value.length, bytes = n * 8;
		this.uint32(bytes);
		this._reserve(bytes);
		var p = this.pos, i, bits, dv = getLazyView(this, n, VIEW_THRESHOLD_INT);
		if (dv) for (i = 0; i < n; ++i) {
			bits = LongBits.from(value[i]);
			dv.setUint32(p, bits.lo, true);
			dv.setUint32(p + 4, bits.hi, true);
			p += 8;
		}
		else {
			var buf = this.buf;
			for (i = 0; i < n; ++i) {
				bits = LongBits.from(value[i]);
				writeFixed32(bits.lo, buf, p);
				writeFixed32(bits.hi, buf, p + 4);
				p += 8;
			}
		}
		this.pos += bytes;
		return this;
	};
	/**
	* Writes an array of signed 64 bit values as packed, fixed 64 bits.
	* @function
	* @param {Array.<Long|number|string>} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.sfixed64s = Writer.prototype.fixed64s;
	/**
	* Writes an array of floats (32 bit) as a packed repeated field.
	* @param {number[]} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.floats = function write_floats(value) {
		var n = value.length, bytes = n * 4;
		this.uint32(bytes);
		this._reserve(bytes);
		var p = this.pos, i, dv = getLazyView(this, n, VIEW_THRESHOLD_FLOAT);
		if (dv) for (i = 0; i < n; ++i) {
			dv.setFloat32(p, value[i], true);
			p += 4;
		}
		else {
			var buf = this.buf;
			for (i = 0; i < n; ++i) {
				util.float.writeFloatLE(value[i], buf, p);
				p += 4;
			}
		}
		this.pos += bytes;
		return this;
	};
	/**
	* Writes an array of doubles (64 bit float) as a packed repeated field.
	* @param {number[]} value Values to write
	* @returns {Writer} `this`
	*/
	Writer.prototype.doubles = function write_doubles(value) {
		var n = value.length, bytes = n * 8;
		this.uint32(bytes);
		this._reserve(bytes);
		var p = this.pos, i, dv = getLazyView(this, n, VIEW_THRESHOLD_FLOAT);
		if (dv) for (i = 0; i < n; ++i) {
			dv.setFloat64(p, value[i], true);
			p += 8;
		}
		else {
			var buf = this.buf;
			for (i = 0; i < n; ++i) {
				util.float.writeDoubleLE(value[i], buf, p);
				p += 8;
			}
		}
		this.pos += bytes;
		return this;
	};
	/**
	* Forks this writer's state by pushing it to a stack.
	* @returns {Writer} `this`
	*/
	Writer.prototype.fork = function fork() {
		this._reserve(1);
		(this.states || (this.states = [])).push(this.pos);
		this.pos += 1;
		return this;
	};
	/**
	* Resets this instance to the last state.
	* @returns {Writer} `this`
	*/
	Writer.prototype.reset = function reset() {
		var states = this.states;
		if (states && states.length) this.pos = states.pop();
		else this.pos = 0;
		return this;
	};
	/**
	* Resets to the last state and prepends the fork state's current write length as a varint.
	* @returns {Writer} `this`
	*/
	Writer.prototype.ldelim = function ldelim() {
		var states = this.states, len, vlen;
		if (states && states.length) {
			var lenPos = states.pop();
			len = this.pos - lenPos - 1;
			vlen = sizeVarint32(len);
			if (vlen > 1) {
				this._reserve(vlen - 1);
				this.buf.copyWithin(lenPos + vlen, lenPos + 1, lenPos + 1 + len);
				this.pos += vlen - 1;
				writeVarint32(len, this.buf, lenPos);
			} else this.buf[lenPos] = len;
		} else {
			len = this.pos;
			vlen = sizeVarint32(len);
			this._reserve(vlen);
			this.buf.copyWithin(vlen, 0, len);
			writeVarint32(len, this.buf, 0);
			this.pos += vlen;
		}
		return this;
	};
	/**
	* Finishes the write operation.
	* Returns a buffer sized to the written data by default.
	* @param {boolean} [shared=false] Whether to return a shared view instead of a unique copy
	* @returns {Uint8Array} Finished buffer
	*/
	Writer.prototype.finish = function finish(shared) {
		if (shared) return this.buf.subarray(0, this.pos);
		var buf = this.constructor.alloc(this.pos);
		buf.set(this.buf.subarray(0, this.pos), 0);
		return buf;
	};
	/**
	* Finishes the write operation, writing into the provided buffer.
	* The caller must ensure that `buf` has enough space starting at `offset`
	* to hold {@link Writer#pos} bytes.
	* @param {T} buf Target buffer
	* @param {number} [offset=0] Offset to start writing at
	* @returns {T} The provided buffer
	* @template T extends Uint8Array
	*/
	Writer.prototype.finishInto = function finishInto(buf, offset) {
		if (offset === void 0) offset = 0;
		buf.set(this.buf.subarray(0, this.pos), offset);
		return buf;
	};
	Writer._configure = function(BufferWriter_) {
		BufferWriter = BufferWriter_;
		Writer.create = create();
		BufferWriter._configure();
	};
}));
//#endregion
//#region node_modules/protobufjs/src/writer_buffer.js
var require_writer_buffer = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = BufferWriter;
	var Writer = require_writer();
	BufferWriter.prototype = Object.create(Writer.prototype, { constructor: {
		value: BufferWriter,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	var util = require_minimal();
	/**
	* Constructs a new buffer writer instance.
	* @classdesc Wire format writer using node buffers.
	* @extends Writer
	* @constructor
	*/
	function BufferWriter() {
		Writer.call(this);
	}
	var writeStringBuffer;
	BufferWriter._configure = function() {
		/**
		* Allocates a buffer of the specified size.
		* @function
		* @param {number} size Buffer size
		* @returns {Buffer} Buffer
		*/
		BufferWriter.alloc = util.Buffer && util.Buffer.allocUnsafe;
		writeStringBuffer = util.Buffer && util.Buffer.prototype.utf8Write ? function writeStringBuffer_utf8Write(val, buf, pos) {
			return buf.utf8Write(val, pos);
		} : function writeStringBuffer_write(val, buf, pos) {
			return buf.write(val, pos);
		};
	};
	/**
	* @override
	*/
	BufferWriter.prototype.bytes = function write_bytes_buffer(value) {
		if (util.isString(value)) value = util.Buffer.from(value, "base64");
		var len = value.length >>> 0;
		this.uint32(len);
		if (len) {
			this._reserve(len);
			this.buf.set(value, this.pos);
			this.pos += len;
		}
		return this;
	};
	/**
	* @override
	*/
	BufferWriter.prototype.string = function write_string_buffer(value) {
		var n = value.length;
		if (!n) {
			this._reserve(1);
			this.buf[this.pos++] = 0;
			return this;
		}
		if (n < 128) {
			this._reserve(n * 3 + 5);
			var pos = this.pos, buf = this.buf;
			return this._delim(pos, n < 40 ? util.utf8.write(value, buf, pos + 1) : writeStringBuffer(value, buf, pos + 1));
		}
		var len = util.Buffer.byteLength(value);
		this.uint32(len);
		this._reserve(len);
		writeStringBuffer(value, this.buf, this.pos);
		this.pos += len;
		return this;
	};
	/**
	* Finishes the write operation.
	* @name BufferWriter#finish
	* @function
	* @returns {Buffer} Finished buffer
	*/
	BufferWriter._configure();
}));
//#endregion
//#region node_modules/protobufjs/src/reader.js
var require_reader = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Reader;
	var util = require_minimal();
	var BufferReader;
	var LongBits = util.LongBits;
	var utf8 = util.utf8;
	/* istanbul ignore next */
	function indexOutOfRange(reader, writeLength) {
		return RangeError("index out of range: " + reader.pos + " + " + (writeLength || 1) + " > " + reader.len);
	}
	/**
	* Constructs a new reader instance using the specified buffer.
	* @classdesc Wire format reader using `Uint8Array`.
	* @constructor
	* @param {Uint8Array} buffer Buffer to read from
	*/
	function Reader(buffer) {
		/**
		* Read buffer.
		* @type {Uint8Array}
		*/
		this.buf = buffer;
		/**
		* Read buffer position.
		* @type {number}
		*/
		this.pos = 0;
		/**
		* Read buffer length.
		* @type {number}
		*/
		this.len = buffer.length;
		/**
		* Cached DataView for packed reads.
		* @type {DataView|null}
		*/
		this.view = null;
		/**
		* Whether to discard unknown fields while decoding.
		* @type {boolean}
		*/
		this.discardUnknown = Reader.discardUnknown;
	}
	function create_array(buffer) {
		if (Array.isArray(buffer)) buffer = new Uint8Array(buffer);
		if (buffer instanceof Uint8Array) return new Reader(buffer);
		throw Error("illegal buffer");
	}
	var create = function create() {
		return util.Buffer ? function create_buffer_setup(buffer) {
			return (Reader.create = function create_buffer(buffer) {
				return util.Buffer.isBuffer(buffer) ? new BufferReader(buffer) : create_array(buffer);
			})(buffer);
		} : create_array;
	};
	/**
	* Creates a new reader using the specified buffer.
	* @function
	* @param {Uint8Array|Buffer} buffer Buffer to read from
	* @returns {Reader|BufferReader} A {@link BufferReader} if `buffer` is a Buffer, otherwise a {@link Reader}
	* @throws {Error} If `buffer` is not a valid buffer
	*/
	Reader.create = create();
	/**
	* Returns raw bytes from the backing buffer without advancing the reader.
	* @param {number} start Start offset
	* @param {number} end End offset
	* @returns {Uint8Array} Raw bytes
	*/
	Reader.prototype.raw = function read_raw(start, end) {
		return this.buf.subarray(start, end);
	};
	/**
	* Reads a varint as an unsigned 32 bit value.
	* @function
	* @returns {number} Value read
	*/
	Reader.prototype.uint32 = function read_uint32() {
		var buf = this.buf, pos = this.pos, value = (buf[pos] & 127) >>> 0;
		if (buf[pos++] < 128) {
			this.pos = pos;
			return value;
		}
		value = (value | (buf[pos] & 127) << 7) >>> 0;
		if (buf[pos++] < 128) {
			this.pos = pos;
			return value;
		}
		value = (value | (buf[pos] & 127) << 14) >>> 0;
		if (buf[pos++] < 128) {
			this.pos = pos;
			return value;
		}
		value = (value | (buf[pos] & 127) << 21) >>> 0;
		if (buf[pos++] < 128) {
			this.pos = pos;
			return value;
		}
		value = (value | (buf[pos] & 15) << 28) >>> 0;
		if (buf[pos++] < 128) {
			this.pos = pos;
			return value;
		}
		for (var i = 0; i < 5; ++i) {
			/* istanbul ignore if */
			if (pos >= this.len) {
				this.pos = pos;
				throw indexOutOfRange(this);
			}
			if (buf[pos++] < 128) {
				this.pos = pos;
				return value;
			}
		}
		/* istanbul ignore next */
		this.pos = pos;
		throw Error("invalid varint encoding");
	};
	/**
	* Reads a field tag.
	* @function
	* @returns {number} Tag read
	*/
	Reader.prototype.tag = function read_tag() {
		var buf = this.buf, pos = this.pos, value = (buf[pos] & 127) >>> 0;
		if (buf[pos++] < 128) {
			this.pos = pos;
			return value;
		}
		value = (value | (buf[pos] & 127) << 7) >>> 0;
		if (buf[pos++] < 128) {
			this.pos = pos;
			return value;
		}
		value = (value | (buf[pos] & 127) << 14) >>> 0;
		if (buf[pos++] < 128) {
			this.pos = pos;
			return value;
		}
		value = (value | (buf[pos] & 127) << 21) >>> 0;
		if (buf[pos++] < 128) {
			this.pos = pos;
			return value;
		}
		value = (value | (buf[pos] & 15) << 28) >>> 0;
		if (buf[pos] < 128 && (buf[pos] & 112) === 0) {
			this.pos = pos + 1;
			return value;
		}
		this.pos = pos + 1;
		throw Error("invalid tag encoding");
	};
	/**
	* Reads a varint as a signed 32 bit value.
	* @returns {number} Value read
	*/
	Reader.prototype.int32 = function read_int32() {
		return this.uint32() | 0;
	};
	/**
	* Reads a zig-zag encoded varint as a signed 32 bit value.
	* @returns {number} Value read
	*/
	Reader.prototype.sint32 = function read_sint32() {
		var value = this.uint32();
		return value >>> 1 ^ -(value & 1) | 0;
	};
	function readLongVarint() {
		var bits = new LongBits(0, 0);
		var i = 0;
		if (this.len - this.pos > 4) {
			for (; i < 4; ++i) {
				bits.lo = (bits.lo | (this.buf[this.pos] & 127) << i * 7) >>> 0;
				if (this.buf[this.pos++] < 128) return bits;
			}
			bits.lo = (bits.lo | (this.buf[this.pos] & 127) << 28) >>> 0;
			bits.hi = (bits.hi | (this.buf[this.pos] & 127) >> 4) >>> 0;
			if (this.buf[this.pos++] < 128) return bits;
			i = 0;
		} else {
			for (; i < 4; ++i) {
				/* istanbul ignore if */
				if (this.pos >= this.len) throw indexOutOfRange(this);
				bits.lo = (bits.lo | (this.buf[this.pos] & 127) << i * 7) >>> 0;
				if (this.buf[this.pos++] < 128) return bits;
			}
			throw indexOutOfRange(this);
		}
		if (this.len - this.pos > 4) for (; i < 5; ++i) {
			bits.hi = (bits.hi | (this.buf[this.pos] & 127) << i * 7 + 3) >>> 0;
			if (this.buf[this.pos++] < 128) return bits;
		}
		else for (; i < 5; ++i) {
			/* istanbul ignore if */
			if (this.pos >= this.len) throw indexOutOfRange(this);
			bits.hi = (bits.hi | (this.buf[this.pos] & 127) << i * 7 + 3) >>> 0;
			if (this.buf[this.pos++] < 128) return bits;
		}
		/* istanbul ignore next */
		throw Error("invalid varint encoding");
	}
	/**
	* Reads a varint as a signed 64 bit value.
	* @name Reader#int64
	* @function
	* @returns {Long} Value read
	*/
	/**
	* Reads a varint as an unsigned 64 bit value.
	* @name Reader#uint64
	* @function
	* @returns {Long} Value read
	*/
	/**
	* Reads a zig-zag encoded varint as a signed 64 bit value.
	* @name Reader#sint64
	* @function
	* @returns {Long} Value read
	*/
	/**
	* Reads a varint as a boolean.
	* @returns {boolean} Value read
	*/
	Reader.prototype.bool = function read_bool() {
		var value = false, b;
		for (var i = 0; i < 10; ++i) {
			/* istanbul ignore if */
			if (this.pos >= this.len) throw indexOutOfRange(this);
			b = this.buf[this.pos++];
			if (b & 127) value = true;
			if (b < 128) return value;
		}
		/* istanbul ignore next */
		throw Error("invalid varint encoding");
	};
	function readFixed32_end(buf, end) {
		return (buf[end - 4] | buf[end - 3] << 8 | buf[end - 2] << 16 | buf[end - 1] << 24) >>> 0;
	}
	/**
	* Reads fixed 32 bits as an unsigned 32 bit integer.
	* @returns {number} Value read
	*/
	Reader.prototype.fixed32 = function read_fixed32() {
		/* istanbul ignore if */
		if (this.pos + 4 > this.len) throw indexOutOfRange(this, 4);
		return readFixed32_end(this.buf, this.pos += 4);
	};
	/**
	* Reads fixed 32 bits as a signed 32 bit integer.
	* @returns {number} Value read
	*/
	Reader.prototype.sfixed32 = function read_sfixed32() {
		/* istanbul ignore if */
		if (this.pos + 4 > this.len) throw indexOutOfRange(this, 4);
		return readFixed32_end(this.buf, this.pos += 4) | 0;
	};
	function readFixed64() {
		/* istanbul ignore if */
		if (this.pos + 8 > this.len) throw indexOutOfRange(this, 8);
		return new LongBits(readFixed32_end(this.buf, this.pos += 4), readFixed32_end(this.buf, this.pos += 4));
	}
	/**
	* Reads fixed 64 bits.
	* @name Reader#fixed64
	* @function
	* @returns {Long} Value read
	*/
	/**
	* Reads zig-zag encoded fixed 64 bits.
	* @name Reader#sfixed64
	* @function
	* @returns {Long} Value read
	*/
	/**
	* Reads a float (32 bit) as a number.
	* @function
	* @returns {number} Value read
	*/
	Reader.prototype.float = function read_float() {
		/* istanbul ignore if */
		if (this.pos + 4 > this.len) throw indexOutOfRange(this, 4);
		var value = util.float.readFloatLE(this.buf, this.pos);
		this.pos += 4;
		return value;
	};
	/**
	* Reads a double (64 bit float) as a number.
	* @function
	* @returns {number} Value read
	*/
	Reader.prototype.double = function read_double() {
		/* istanbul ignore if */
		if (this.pos + 8 > this.len) throw indexOutOfRange(this, 4);
		var value = util.float.readDoubleLE(this.buf, this.pos);
		this.pos += 8;
		return value;
	};
	/**
	* Reads a packed repeated field of unsigned 32 bit varints.
	* @param {number[]} [array] Array to read into; a new one is created if omitted
	* @returns {number[]} Array read into
	*/
	Reader.prototype.uint32s = function read_uint32s(array) {
		if (array === void 0) array = [];
		var end = this.uint32() + this.pos, buf = this.buf, pos = this.pos, value;
		while (pos < end) {
			value = buf[pos++];
			if (value < 128) array.push(value);
			else {
				this.pos = pos - 1;
				array.push(this.uint32());
				pos = this.pos;
			}
		}
		this.pos = pos;
		return array;
	};
	/**
	* Reads a packed repeated field of signed 32 bit varints.
	* @param {number[]} [array] Array to read into; a new one is created if omitted
	* @returns {number[]} Array read into
	*/
	Reader.prototype.int32s = function read_int32s(array) {
		if (array === void 0) array = [];
		var end = this.uint32() + this.pos, buf = this.buf, pos = this.pos, value;
		while (pos < end) {
			value = buf[pos++];
			if (value < 128) array.push(value);
			else {
				this.pos = pos - 1;
				array.push(this.int32());
				pos = this.pos;
			}
		}
		this.pos = pos;
		return array;
	};
	/**
	* Reads a packed repeated field of zig-zag encoded signed 32 bit varints.
	* @param {number[]} [array] Array to read into; a new one is created if omitted
	* @returns {number[]} Array read into
	*/
	Reader.prototype.sint32s = function read_sint32s(array) {
		if (array === void 0) array = [];
		var end = this.uint32() + this.pos;
		while (this.pos < end) array.push(this.sint32());
		return array;
	};
	/**
	* Reads a packed repeated field of booleans.
	* @param {boolean[]} [array] Array to read into; a new one is created if omitted
	* @returns {boolean[]} Array read into
	*/
	Reader.prototype.bools = function read_bools(array) {
		if (array === void 0) array = [];
		var end = this.uint32() + this.pos, buf = this.buf, pos = this.pos, value;
		while (pos < end) {
			value = buf[pos++];
			if (value < 128) array.push(value !== 0);
			else {
				this.pos = pos - 1;
				array.push(this.bool());
				pos = this.pos;
			}
		}
		this.pos = pos;
		return array;
	};
	var VIEW_THRESHOLD_FLOAT = 8;
	var VIEW_THRESHOLD_INT = 128;
	function getLazyView(reader, count, threshold) {
		var view = reader.view;
		if (view || count < threshold) return view;
		var buf = reader.buf;
		return reader.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	}
	/**
	* Reads a packed repeated field of unsigned 32 bit fixed values.
	* @param {number[]} [array] Array to read into; a new one is created if omitted
	* @returns {number[]} Array read into
	*/
	Reader.prototype.fixed32s = function read_fixed32s(array) {
		if (array === void 0) array = [];
		var len = this.uint32(), end = this.pos + len;
		/* istanbul ignore if */
		if (end > this.len) throw indexOutOfRange(this, len);
		var count = len >>> 2, i = array.length, pos = this.pos;
		array.length = i + count;
		var dv = getLazyView(this, count, VIEW_THRESHOLD_INT);
		if (dv) for (var k = 0; k < count; ++k, pos += 4) array[i++] = dv.getUint32(pos, true);
		else {
			var buf = this.buf;
			for (var j = 0; j < count; ++j, pos += 4) array[i++] = readFixed32_end(buf, pos + 4);
		}
		this.pos = pos;
		if (pos !== end) throw indexOutOfRange(this, 4);
		return array;
	};
	/**
	* Reads a packed repeated field of signed 32 bit fixed values.
	* @param {number[]} [array] Array to read into; a new one is created if omitted
	* @returns {number[]} Array read into
	*/
	Reader.prototype.sfixed32s = function read_sfixed32s(array) {
		if (array === void 0) array = [];
		var len = this.uint32(), end = this.pos + len;
		/* istanbul ignore if */
		if (end > this.len) throw indexOutOfRange(this, len);
		var count = len >>> 2, i = array.length, pos = this.pos;
		array.length = i + count;
		var dv = getLazyView(this, count, VIEW_THRESHOLD_INT);
		if (dv) for (var k = 0; k < count; ++k, pos += 4) array[i++] = dv.getInt32(pos, true);
		else {
			var buf = this.buf;
			for (var j = 0; j < count; ++j, pos += 4) array[i++] = readFixed32_end(buf, pos + 4) | 0;
		}
		this.pos = pos;
		if (pos !== end) throw indexOutOfRange(this, 4);
		return array;
	};
	/**
	* Reads a packed repeated field of floats (32 bit).
	* @param {number[]} [array] Array to read into; a new one is created if omitted
	* @returns {number[]} Array read into
	*/
	Reader.prototype.floats = function read_floats(array) {
		if (array === void 0) array = [];
		var len = this.uint32(), end = this.pos + len;
		/* istanbul ignore if */
		if (end > this.len) throw indexOutOfRange(this, len);
		var count = len >>> 2, i = array.length, pos = this.pos;
		array.length = i + count;
		var dv = getLazyView(this, count, VIEW_THRESHOLD_FLOAT);
		if (dv) for (var k = 0; k < count; ++k, pos += 4) array[i++] = dv.getFloat32(pos, true);
		else {
			var buf = this.buf;
			for (var j = 0; j < count; ++j, pos += 4) array[i++] = util.float.readFloatLE(buf, pos);
		}
		this.pos = pos;
		if (pos !== end) throw indexOutOfRange(this, 4);
		return array;
	};
	/**
	* Reads a packed repeated field of doubles (64 bit float).
	* @param {number[]} [array] Array to read into; a new one is created if omitted
	* @returns {number[]} Array read into
	*/
	Reader.prototype.doubles = function read_doubles(array) {
		if (array === void 0) array = [];
		var len = this.uint32(), end = this.pos + len;
		/* istanbul ignore if */
		if (end > this.len) throw indexOutOfRange(this, len);
		var count = len >>> 3, i = array.length, pos = this.pos;
		array.length = i + count;
		var dv = getLazyView(this, count, VIEW_THRESHOLD_FLOAT);
		if (dv) for (var k = 0; k < count; ++k, pos += 8) array[i++] = dv.getFloat64(pos, true);
		else {
			var buf = this.buf;
			for (var j = 0; j < count; ++j, pos += 8) array[i++] = util.float.readDoubleLE(buf, pos);
		}
		this.pos = pos;
		if (pos !== end) throw indexOutOfRange(this, 8);
		return array;
	};
	/**
	* Reads a packed repeated field of unsigned 64 bit varints.
	* @param {Array.<Long|number>} [array] Array to read into; a new one is created if omitted
	* @returns {Array.<Long|number>} Array read into
	*/
	Reader.prototype.uint64s = function read_uint64s(array) {
		if (array === void 0) array = [];
		var end = this.uint32() + this.pos;
		while (this.pos < end) array.push(this.uint64());
		return array;
	};
	/**
	* Reads a packed repeated field of signed 64 bit varints.
	* @param {Array.<Long|number>} [array] Array to read into; a new one is created if omitted
	* @returns {Array.<Long|number>} Array read into
	*/
	Reader.prototype.int64s = function read_int64s(array) {
		if (array === void 0) array = [];
		var end = this.uint32() + this.pos;
		while (this.pos < end) array.push(this.int64());
		return array;
	};
	/**
	* Reads a packed repeated field of zig-zag encoded signed 64 bit varints.
	* @param {Array.<Long|number>} [array] Array to read into; a new one is created if omitted
	* @returns {Array.<Long|number>} Array read into
	*/
	Reader.prototype.sint64s = function read_sint64s(array) {
		if (array === void 0) array = [];
		var end = this.uint32() + this.pos;
		while (this.pos < end) array.push(this.sint64());
		return array;
	};
	/**
	* Reads a packed repeated field of unsigned 64 bit fixed values.
	* @param {Array.<Long|number>} [array] Array to read into; a new one is created if omitted
	* @returns {Array.<Long|number>} Array read into
	*/
	Reader.prototype.fixed64s = function read_fixed64s(array) {
		if (array === void 0) array = [];
		var len = this.uint32(), end = this.pos + len, i = array.length;
		/* istanbul ignore if */
		if (end > this.len) throw indexOutOfRange(this, len);
		var count = len >>> 3;
		array.length = i + count;
		for (var j = 0; j < count; ++j) array[i++] = this.fixed64();
		if (this.pos !== end) throw indexOutOfRange(this, 8);
		return array;
	};
	/**
	* Reads a packed repeated field of signed 64 bit fixed values.
	* @param {Array.<Long|number>} [array] Array to read into; a new one is created if omitted
	* @returns {Array.<Long|number>} Array read into
	*/
	Reader.prototype.sfixed64s = function read_sfixed64s(array) {
		if (array === void 0) array = [];
		var len = this.uint32(), end = this.pos + len, i = array.length;
		/* istanbul ignore if */
		if (end > this.len) throw indexOutOfRange(this, len);
		var count = len >>> 3;
		array.length = i + count;
		for (var j = 0; j < count; ++j) array[i++] = this.sfixed64();
		if (this.pos !== end) throw indexOutOfRange(this, 8);
		return array;
	};
	/**
	* Reads a sequence of bytes preceeded by its length as a varint.
	* @returns {Uint8Array} Value read
	*/
	Reader.prototype.bytes = function read_bytes() {
		var length = this.uint32(), start = this.pos, end = this.pos + length;
		/* istanbul ignore if */
		if (end > this.len) throw indexOutOfRange(this, length);
		this.pos = end;
		return this.raw(start, end);
	};
	/**
	* Reads a string preceeded by its byte length as a varint.
	* @returns {string} Value read
	*/
	Reader.prototype.string = function read_string() {
		var length = this.uint32(), start = this.pos, end = this.pos + length;
		/* istanbul ignore if */
		if (end > this.len) throw indexOutOfRange(this, length);
		this.pos = end;
		return utf8.read(this.buf, start, end);
	};
	/**
	* Reads a string preceeded by its byte length as a varint, rejecting invalid UTF8.
	* @returns {string} Value read
	*/
	Reader.prototype.stringVerify = function read_string_verify() {
		var length = this.uint32(), start = this.pos, end = this.pos + length;
		/* istanbul ignore if */
		if (end > this.len) throw indexOutOfRange(this, length);
		this.pos = end;
		return utf8.readStrict(this.buf, start, end);
	};
	/**
	* Skips the specified number of bytes if specified, otherwise skips a varint.
	* @param {number} [length] Length if known, otherwise a varint is assumed
	* @returns {Reader} `this`
	*/
	Reader.prototype.skip = function skip(length) {
		if (typeof length === "number") {
			/* istanbul ignore if */
			if (this.pos + length > this.len) throw indexOutOfRange(this, length);
			this.pos += length;
		} else do
			/* istanbul ignore if */
			if (this.pos >= this.len) throw indexOutOfRange(this);
		while (this.buf[this.pos++] & 128);
		return this;
	};
	/**
	* Recursion limit.
	* @type {number}
	*/
	Reader.recursionLimit = util.recursionLimit;
	/**
	* Whether readers discard unknown fields while decoding.
	* @type {boolean}
	*/
	Reader.discardUnknown = true;
	/**
	* Skips the next element of the specified wire type.
	* @param {number} wireType Wire type received
	* @param {number} [depth] Depth of recursion to control nested calls; 0 if omitted
	* @param {number} [fieldNumber] Field number for validating group end tags
	* @returns {Reader} `this`
	*/
	Reader.prototype.skipType = function(wireType, depth, fieldNumber) {
		if (depth === void 0) depth = 0;
		if (depth > Reader.recursionLimit) throw Error("max depth exceeded");
		if (fieldNumber === 0) throw Error("illegal tag: field number 0");
		switch (wireType) {
			case 0:
				this.skip();
				break;
			case 1:
				this.skip(8);
				break;
			case 2:
				this.skip(this.uint32());
				break;
			case 3:
				while (true) {
					var tag = this.tag();
					var nestedField = tag >>> 3;
					wireType = tag & 7;
					if (!nestedField) throw Error("illegal tag: field number 0");
					if (wireType === 4) {
						if (fieldNumber !== void 0 && nestedField !== fieldNumber) throw Error("invalid end group tag");
						break;
					}
					this.skipType(wireType, depth + 1, nestedField);
				}
				break;
			case 5:
				this.skip(4);
				break;
			/* istanbul ignore next */
			default: throw Error("invalid wire type " + wireType + " at offset " + this.pos);
		}
		return this;
	};
	Reader._configure = function(BufferReader_) {
		BufferReader = BufferReader_;
		Reader.create = create();
		BufferReader._configure();
		var fn = util.Long ? "toLong" : /* istanbul ignore next */ "toNumber";
		util.merge(Reader.prototype, {
			int64: function read_int64() {
				return readLongVarint.call(this)[fn](false);
			},
			uint64: function read_uint64() {
				return readLongVarint.call(this)[fn](true);
			},
			sint64: function read_sint64() {
				return readLongVarint.call(this).zzDecode()[fn](false);
			},
			fixed64: function read_fixed64() {
				return readFixed64.call(this)[fn](true);
			},
			sfixed64: function read_sfixed64() {
				return readFixed64.call(this)[fn](false);
			}
		});
	};
}));
//#endregion
//#region node_modules/protobufjs/src/reader_buffer.js
var require_reader_buffer = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = BufferReader;
	var Reader = require_reader();
	BufferReader.prototype = Object.create(Reader.prototype, { constructor: {
		value: BufferReader,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	var util = require_minimal();
	/**
	* Constructs a new buffer reader instance.
	* @classdesc Wire format reader using node buffers.
	* @extends Reader
	* @constructor
	* @param {Buffer} buffer Buffer to read from
	*/
	function BufferReader(buffer) {
		Reader.call(this, buffer);
		/**
		* Read buffer.
		* @name BufferReader#buf
		* @type {Buffer}
		*/
	}
	BufferReader._configure = function() {
		/* istanbul ignore else */
		if (util.Buffer) BufferReader.prototype._slice = util.Buffer.prototype.slice;
	};
	/**
	* Returns raw bytes from the backing buffer without advancing the reader.
	* @name BufferReader#raw
	* @function
	* @param {number} start Start offset
	* @param {number} end End offset
	* @returns {Buffer} Raw bytes
	*/
	BufferReader.prototype.raw = function read_raw_buffer(start, end) {
		return this._slice.call(this.buf, start, end);
	};
	/**
	* @override
	*/
	BufferReader.prototype.string = function read_string_buffer() {
		var len = this.uint32(), start = this.pos, end = this.pos + len;
		/* istanbul ignore if */
		if (end > this.len) throw RangeError("index out of range: " + this.pos + " + " + len + " > " + this.len);
		this.pos = end;
		return this.buf.utf8Slice ? this.buf.utf8Slice(start, end) : this.buf.toString("utf-8", start, end);
	};
	/**
	* Reads a sequence of bytes preceeded by its length as a varint.
	* @name BufferReader#bytes
	* @function
	* @returns {Buffer} Value read
	*/
	BufferReader._configure();
}));
//#endregion
//#region node_modules/protobufjs/src/rpc/service.js
var require_service$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Service;
	var util = require_minimal();
	Service.prototype = Object.create(util.EventEmitter.prototype, { constructor: {
		value: Service,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	/**
	* A service method callback as used by {@link rpc.ServiceMethod|ServiceMethod}.
	*
	* Differs from {@link RPCImplCallback} in that it is an actual callback of a service method which may not return `response = null`.
	* @typedef rpc.ServiceMethodCallback
	* @template TRes extends Message<TRes>
	* @type {function}
	* @param {Error|null} error Error, if any
	* @param {TRes} [response] Response message
	* @returns {undefined}
	*/
	/**
	* A service method part of a {@link rpc.Service} as created by {@link Service.create}.
	* @typedef rpc.ServiceMethod
	* @template TReq extends Message<TReq>
	* @template TRes extends Message<TRes>
	* @type {{
	*   (request: TReq|Properties<TReq>, callback: rpc.ServiceMethodCallback<TRes>): void;
	*   (request: TReq|Properties<TReq>): Promise<TRes>;
	*   readonly name: string;
	*   readonly path: string;
	*   readonly requestType: string;
	*   readonly responseType: string;
	*   readonly requestStream: true|undefined;
	*   readonly responseStream: true|undefined;
	* }}
	*/
	/**
	* Constructs a new RPC service instance.
	* @classdesc An RPC service as returned by {@link Service#create}.
	* @exports rpc.Service
	* @extends util.EventEmitter
	* @constructor
	* @param {RPCImpl} rpcImpl RPC implementation
	* @param {boolean} [requestDelimited=false] Whether requests are length-delimited
	* @param {boolean} [responseDelimited=false] Whether responses are length-delimited
	*/
	function Service(rpcImpl, requestDelimited, responseDelimited) {
		if (typeof rpcImpl !== "function") throw TypeError("rpcImpl must be a function");
		util.EventEmitter.call(this);
		/**
		* RPC implementation. Becomes `null` once the service is ended.
		* @type {RPCImpl|null}
		*/
		this.rpcImpl = rpcImpl;
		/**
		* Whether requests are length-delimited.
		* @type {boolean}
		*/
		this.requestDelimited = Boolean(requestDelimited);
		/**
		* Whether responses are length-delimited.
		* @type {boolean}
		*/
		this.responseDelimited = Boolean(responseDelimited);
	}
	/**
	* Calls a service method through {@link rpc.Service#rpcImpl|rpcImpl}.
	* @param {Method|rpc.ServiceMethod<TReq,TRes>} method Reflected or static method
	* @param {Constructor<TReq>} requestCtor Request constructor
	* @param {Constructor<TRes>} responseCtor Response constructor
	* @param {TReq|Properties<TReq>} request Request message or plain object
	* @param {rpc.ServiceMethodCallback<TRes>} callback Service callback
	* @returns {undefined}
	* @template TReq extends Message<TReq>
	* @template TRes extends Message<TRes>
	*/
	Service.prototype.rpcCall = function rpcCall(method, requestCtor, responseCtor, request, callback) {
		if (!request) throw TypeError("request must be specified");
		var self = this;
		if (!callback) return util.asPromise(rpcCall, self, method, requestCtor, responseCtor, request);
		if (!self.rpcImpl) {
			setTimeout(function() {
				callback(Error("already ended"));
			}, 0);
			return;
		}
		try {
			return self.rpcImpl(method, requestCtor[self.requestDelimited ? "encodeDelimited" : "encode"](request).finish(), function rpcCallback(err, response) {
				if (err) {
					self.emit("error", err, method);
					return callback(err);
				}
				if (response === null) {
					self.end(true);
					return;
				}
				if (!(response instanceof responseCtor)) try {
					response = responseCtor[self.responseDelimited ? "decodeDelimited" : "decode"](response);
				} catch (err) {
					self.emit("error", err, method);
					return callback(err);
				}
				self.emit("data", response, method);
				return callback(null, response);
			});
		} catch (err) {
			self.emit("error", err, method);
			setTimeout(function() {
				callback(err);
			}, 0);
			return;
		}
	};
	/**
	* Ends this service and emits the `end` event.
	* @param {boolean} [endedByRPC=false] Whether the service has been ended by the RPC implementation.
	* @returns {rpc.Service} `this`
	*/
	Service.prototype.end = function end(endedByRPC) {
		if (this.rpcImpl) {
			if (!endedByRPC) this.rpcImpl(null, null, null);
			this.rpcImpl = null;
			this.emit("end").off();
		}
		return this;
	};
}));
//#endregion
//#region node_modules/protobufjs/src/rpc.js
var require_rpc = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Streaming RPC helpers.
	* @namespace
	*/
	var rpc = exports;
	/**
	* RPC implementation passed to {@link Service#create} performing a service request on network level, i.e. by utilizing http requests or websockets.
	* @typedef RPCImpl
	* @type {function}
	* @param {Method|rpc.ServiceMethod<Message<{}>,Message<{}>>} method Reflected or static method being called
	* @param {Uint8Array} requestData Request data
	* @param {RPCImplCallback} callback Callback function
	* @returns {undefined}
	* @example
	* function rpcImpl(method, requestData, callback) {
	*     if (protobuf.util.lcFirst(method.name) !== "myMethod") // compatible with static code
	*         throw Error("no such method");
	*     asynchronouslyObtainAResponse(requestData, function(err, responseData) {
	*         callback(err, responseData);
	*     });
	* }
	*/
	/**
	* Node-style callback as used by {@link RPCImpl}.
	* @typedef RPCImplCallback
	* @type {function}
	* @param {Error|null} error Error, if any, otherwise `null`
	* @param {Uint8Array|null} [response] Response data or `null` to signal end of stream, if there hasn't been an error
	* @returns {undefined}
	*/
	rpc.Service = require_service$1();
}));
//#endregion
//#region node_modules/protobufjs/src/roots.js
var require_roots = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Object.create(null);
}));
/**
* Named roots.
* This is where pbjs stores generated structures (the option `-r, --root` specifies a name).
* Can also be used manually to make roots available across modules.
* @name roots
* @type {Object.<string,Root>}
* @example
* // pbjs -r myroot -o compiled.js ...
*
* // in another module:
* require("./compiled.js");
*
* // in any subsequent module:
* var root = protobuf.roots["myroot"];
*/
//#endregion
//#region node_modules/protobufjs/src/index-minimal.js
var require_index_minimal = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Build type, one of `"full"`, `"light"` or `"minimal"`.
	* @name build
	* @type {string}
	* @const
	*/
	exports.build = "minimal";
	exports.Writer = require_writer();
	exports.BufferWriter = require_writer_buffer();
	exports.Reader = require_reader();
	exports.BufferReader = require_reader_buffer();
	exports.util = require_minimal();
	exports.rpc = require_rpc();
	exports.roots = require_roots();
	exports.configure = configure;
	/* istanbul ignore next */
	/**
	* Reconfigures the library according to the environment.
	* @returns {undefined}
	*/
	function configure() {
		exports.util.LongBits._configure(exports.util.Long);
		exports.Writer._configure(exports.BufferWriter);
		exports.Reader._configure(exports.BufferReader);
	}
	configure();
}));
//#endregion
//#region node_modules/protobufjs/src/util/patterns.js
var require_patterns = /* @__PURE__ */ __commonJSMin(((exports) => {
	var patterns = exports;
	patterns.numberRe = /^(?![eE])[0-9]*(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?$/;
	patterns.typeRefRe = /^(?:\.?[a-zA-Z_][a-zA-Z_0-9]*)(?:\.[a-zA-Z_][a-zA-Z_0-9]*)*$/;
	patterns.reservedRe = /^(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$/;
}));
//#endregion
//#region node_modules/protobufjs/src/util/codegen.js
var require_codegen = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = codegen;
	var reservedRe = require_patterns().reservedRe;
	/**
	* Begins generating a function.
	* @memberof util
	* @param {string[]} functionParams Function parameter names
	* @param {string} [functionName] Function name if not anonymous
	* @returns {Codegen} Appender that appends code to the function's body
	*/
	function codegen(functionParams, functionName) {
		/* istanbul ignore if */
		if (typeof functionParams === "string") {
			functionName = functionParams;
			functionParams = void 0;
		}
		var body = [];
		/**
		* Appends code to the function's body or finishes generation.
		* @typedef Codegen
		* @type {function}
		* @param {string|Object.<string,*>} [formatStringOrScope] Format string or, to finish the function, an object of additional scope variables, if any
		* @param {...*} [formatParams] Format parameters
		* @returns {Codegen|Function} Itself or the generated function if finished
		* @throws {Error} If format parameter counts do not match
		*/
		function Codegen(formatStringOrScope) {
			if (typeof formatStringOrScope !== "string") {
				var source = toString();
				if (codegen.verbose) console.log("codegen: " + source);
				source = "return " + source;
				if (formatStringOrScope) {
					var scopeKeys = Object.keys(formatStringOrScope), scopeParams = new Array(scopeKeys.length + 1), scopeValues = new Array(scopeKeys.length), scopeOffset = 0;
					while (scopeOffset < scopeKeys.length) {
						scopeParams[scopeOffset] = scopeKeys[scopeOffset];
						scopeValues[scopeOffset] = formatStringOrScope[scopeKeys[scopeOffset++]];
					}
					scopeParams[scopeOffset] = source;
					return Function.apply(null, scopeParams).apply(null, scopeValues);
				}
				return Function(source)();
			}
			var formatParams = new Array(arguments.length - 1), formatOffset = 0;
			while (formatOffset < formatParams.length) formatParams[formatOffset] = arguments[++formatOffset];
			formatOffset = 0;
			formatStringOrScope = formatStringOrScope.replace(/%([%dfijs])/g, function replace($0, $1) {
				var value = formatParams[formatOffset++];
				switch ($1) {
					case "d":
					case "f":
						value = Number(value);
						return Object.is(value, -0) ? "-0" : String(value);
					case "i": return String(Math.floor(value));
					case "j": return JSON.stringify(value);
					case "s": return String(value);
				}
				return "%";
			});
			if (formatOffset !== formatParams.length) throw Error("parameter count mismatch");
			body.push(formatStringOrScope);
			return Codegen;
		}
		function toString(functionNameOverride) {
			return "function " + safeFunctionName(functionNameOverride || functionName) + "(" + (functionParams && functionParams.join(",") || "") + "){\n  " + body.join("\n  ") + "\n}";
		}
		Object.defineProperty(Codegen, "toString", {
			value: toString,
			writable: true,
			enumerable: true,
			configurable: true
		});
		return Codegen;
	}
	/**
	* Begins generating a function.
	* @memberof util
	* @function codegen
	* @param {string} [functionName] Function name if not anonymous
	* @returns {Codegen} Appender that appends code to the function's body
	* @variation 2
	*/
	/**
	* When set to `true`, codegen will log generated code to console. Useful for debugging.
	* @name util.codegen.verbose
	* @type {boolean}
	*/
	codegen.verbose = false;
	function safeFunctionName(name) {
		if (!name) return "";
		name = String(name).replace(/[^\w$]/g, "");
		if (!name) return "";
		if (/^\d/.test(name)) name = "_" + name;
		return reservedRe.test(name) ? name + "_" : name;
	}
}));
//#endregion
//#region __vite-browser-external
var require___vite_browser_external = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {};
}));
//#endregion
//#region node_modules/protobufjs/src/util/fs.js
var require_fs = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var fs = null;
	try {
		fs = require___vite_browser_external();
		if (!fs || !fs.readFile || !fs.readFileSync) fs = null;
	} catch (e) {}
	module.exports = fs;
}));
//#endregion
//#region node_modules/protobufjs/src/util/fetch.js
var require_fetch = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = fetch;
	var asPromise = require_aspromise();
	var fs = require_fs();
	/**
	* Node-style callback as used by {@link util.fetch}.
	* @typedef FetchCallback
	* @type {function}
	* @param {?Error} error Error, if any, otherwise `null`
	* @param {string} [contents] File contents, if there hasn't been an error
	* @returns {undefined}
	*/
	/**
	* Options as used by {@link util.fetch}.
	* @interface IFetchOptions
	* @property {boolean} [binary=false] Whether expecting a binary response
	* @property {boolean} [xhr=false] If `true`, forces the use of XMLHttpRequest
	*/
	/**
	* Fetches the contents of a file.
	* @memberof util
	* @param {string} filename File path or url
	* @param {IFetchOptions} options Fetch options
	* @param {FetchCallback} callback Callback function
	* @returns {undefined}
	*/
	function fetch(filename, options, callback) {
		if (typeof options === "function") {
			callback = options;
			options = {};
		} else if (!options) options = {};
		if (!callback) return asPromise(fetch, this, filename, options);
		if (!options.xhr && fs && fs.readFile) return fs.readFile(filename, function fetchReadFileCallback(err, contents) {
			return err && typeof XMLHttpRequest !== "undefined" ? fetch.xhr(filename, options, callback) : err ? callback(err) : callback(null, options.binary ? contents : contents.toString("utf8"));
		});
		return fetch.xhr(filename, options, callback);
	}
	/**
	* Fetches the contents of a file.
	* @name util.fetch
	* @function
	* @param {string} path File path or url
	* @param {FetchCallback} callback Callback function
	* @returns {undefined}
	* @variation 2
	*/
	/**
	* Fetches the contents of a file.
	* @name util.fetch
	* @function
	* @param {string} path File path or url
	* @param {IFetchOptions} [options] Fetch options
	* @returns {Promise<string|Uint8Array>} Promise
	* @variation 3
	*/
	fetch.xhr = function fetch_xhr(filename, options, callback) {
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function fetchOnReadyStateChange() {
			if (xhr.readyState !== 4) return void 0;
			if (xhr.status !== 0 && xhr.status !== 200) return callback(Error("status " + xhr.status));
			if (options.binary) {
				var buffer = xhr.response;
				if (!buffer) {
					buffer = [];
					for (var i = 0; i < xhr.responseText.length; ++i) buffer.push(xhr.responseText.charCodeAt(i) & 255);
				}
				return callback(null, typeof Uint8Array !== "undefined" ? new Uint8Array(buffer) : buffer);
			}
			return callback(null, xhr.responseText);
		};
		if (options.binary) {
			if ("overrideMimeType" in xhr) xhr.overrideMimeType("text/plain; charset=x-user-defined");
			xhr.responseType = "arraybuffer";
		}
		xhr.open("GET", filename);
		xhr.send();
	};
}));
//#endregion
//#region node_modules/protobufjs/src/util/path.js
var require_path = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* A minimal path module to resolve Unix, Windows and URL paths alike.
	* @memberof util
	* @namespace
	*/
	var path = exports;
	var urlRe = /^[a-zA-Z][a-zA-Z0-9+.-]+:\/\//;
	function normalizeUrl(path) {
		if (typeof URL === "undefined" || !urlRe.test(path)) return null;
		try {
			return new URL(path).href;
		} catch (e) {
			return null;
		}
	}
	function resolveUrl(originPath, includePath) {
		if (typeof URL === "undefined" || !urlRe.test(originPath) || urlRe.test(includePath)) return null;
		try {
			return new URL(includePath, originPath).href;
		} catch (e) {
			return null;
		}
	}
	var isAbsolute = path.isAbsolute = function isAbsolute(path) {
		return /^(?:\/|\w+:|\\\\\w+)/.test(path);
	};
	var normalize = path.normalize = function normalize(path) {
		var normalizedUrl = normalizeUrl(path);
		if (normalizedUrl) return normalizedUrl;
		var firstTwoCharacters = path.substring(0, 2);
		var uncPrefix = "";
		if (firstTwoCharacters === "\\\\") {
			uncPrefix = firstTwoCharacters;
			path = path.substring(2);
		}
		path = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
		var parts = path.split("/"), absolute = isAbsolute(path), prefix = "";
		if (absolute) prefix = parts.shift() + "/";
		for (var i = 0; i < parts.length;) if (parts[i] === "..") {
			if (i > 0 && parts[i - 1] !== "..") parts.splice(--i, 2);
			else if (absolute) parts.splice(i, 1);
			else ++i;
		} else if (parts[i] === ".") parts.splice(i, 1);
		else ++i;
		return uncPrefix + prefix + parts.join("/");
	};
	/**
	* Resolves the specified include path against the specified origin path.
	* @param {string} originPath Path to the origin file
	* @param {string} includePath Include path relative to origin path
	* @param {boolean} [alreadyNormalized=false] `true` if both paths are already known to be normalized
	* @returns {string} Path to the include file
	*/
	path.resolve = function resolve(originPath, includePath, alreadyNormalized) {
		var resolvedUrl = resolveUrl(originPath, includePath);
		if (resolvedUrl) return resolvedUrl;
		if (!alreadyNormalized) includePath = normalize(includePath);
		if (isAbsolute(includePath)) return includePath;
		if (!alreadyNormalized) originPath = normalize(originPath);
		return (originPath = originPath.replace(/(?:\/|^)[^/]+$/, "")).length ? normalize(originPath + "/" + includePath) : includePath;
	};
}));
//#endregion
//#region node_modules/protobufjs/src/namespace.js
var require_namespace = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Namespace;
	var ReflectionObject = require_object();
	Namespace.prototype = Object.create(ReflectionObject.prototype, { constructor: {
		value: Namespace,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	Namespace.className = "Namespace";
	var Field = require_field();
	var util = require_util();
	var OneOf = require_oneof();
	var Type;
	var Service;
	var Enum;
	/**
	* Constructs a new namespace instance.
	* @name Namespace
	* @classdesc Reflected namespace.
	* @extends NamespaceBase
	* @constructor
	* @param {string} name Namespace name
	* @param {Object.<string,*>} [options] Declared options
	*/
	/**
	* Constructs a namespace from JSON.
	* @memberof Namespace
	* @function
	* @param {string} name Namespace name
	* @param {Object.<string,*>} json JSON object
	* @param {number} [depth] Current nesting depth, defaults to `0`
	* @returns {Namespace} Created namespace
	* @throws {TypeError} If arguments are invalid
	*/
	Namespace.fromJSON = function fromJSON(name, json, depth) {
		if (depth === void 0) depth = 0;
		if (depth > util.recursionLimit) throw Error("max depth exceeded");
		return new Namespace(name, json.options).addJSON(json.nested, depth);
	};
	/**
	* Converts an array of reflection objects to JSON.
	* @memberof Namespace
	* @param {ReflectionObject[]} array Object array
	* @param {IToJSONOptions} [toJSONOptions] JSON conversion options
	* @returns {Object.<string,*>|undefined} JSON object or `undefined` when array is empty
	*/
	function arrayToJSON(array, toJSONOptions) {
		if (!(array && array.length)) return void 0;
		var obj = {};
		for (var i = 0; i < array.length; ++i) obj[array[i].name] = array[i].toJSON(toJSONOptions);
		return obj;
	}
	Namespace.arrayToJSON = arrayToJSON;
	/**
	* Tests if the specified id is reserved.
	* @param {Array.<number[]|string>|undefined} reserved Array of reserved ranges and names
	* @param {number} id Id to test
	* @returns {boolean} `true` if reserved, otherwise `false`
	*/
	Namespace.isReservedId = function isReservedId(reserved, id) {
		if (reserved) {
			for (var i = 0; i < reserved.length; ++i) if (typeof reserved[i] !== "string" && reserved[i][0] <= id && reserved[i][1] >= id) return true;
		}
		return false;
	};
	/**
	* Tests if the specified name is reserved.
	* @param {Array.<number[]|string>|undefined} reserved Array of reserved ranges and names
	* @param {string} name Name to test
	* @returns {boolean} `true` if reserved, otherwise `false`
	*/
	Namespace.isReservedName = function isReservedName(reserved, name) {
		if (reserved) {
			for (var i = 0; i < reserved.length; ++i) if (reserved[i] === name) return true;
		}
		return false;
	};
	/**
	* Not an actual constructor. Use {@link Namespace} instead.
	* @classdesc Base class of all reflection objects containing nested objects. This is not an actual class but here for the sake of having consistent type definitions.
	* @exports NamespaceBase
	* @extends ReflectionObject
	* @abstract
	* @constructor
	* @param {string} name Namespace name
	* @param {Object.<string,*>} [options] Declared options
	* @see {@link Namespace}
	*/
	function Namespace(name, options) {
		ReflectionObject.call(this, name, options);
		/**
		* Nested objects by name.
		* @type {Object.<string,ReflectionObject>|undefined}
		*/
		this.nested = void 0;
		/**
		* Cached nested objects as an array.
		* @type {ReflectionObject[]|null}
		* @private
		*/
		this._nestedArray = null;
		/**
		* Cache lookup calls for any objects contains anywhere under this namespace.
		* This drastically speeds up resolve for large cross-linked protos where the same
		* types are looked up repeatedly.
		* @type {Object.<string,ReflectionObject|null>}
		* @private
		*/
		this._lookupCache = Object.create(null);
		/**
		* Whether or not objects contained in this namespace need feature resolution.
		* @type {boolean}
		* @protected
		*/
		this._needsRecursiveFeatureResolution = true;
		/**
		* Whether or not objects contained in this namespace need a resolve.
		* @type {boolean}
		* @protected
		*/
		this._needsRecursiveResolve = true;
	}
	function clearCache(namespace) {
		namespace._nestedArray = null;
		namespace._lookupCache = Object.create(null);
		var parent = namespace;
		while (parent = parent.parent) parent._lookupCache = Object.create(null);
		return namespace;
	}
	/**
	* Nested objects of this namespace as an array for iteration.
	* @name NamespaceBase#nestedArray
	* @type {ReflectionObject[]}
	* @readonly
	*/
	Object.defineProperty(Namespace.prototype, "nestedArray", { get: function() {
		return this._nestedArray || (this._nestedArray = util.toArray(this.nested));
	} });
	/**
	* Namespace descriptor.
	* @interface INamespace
	* @property {Object.<string,*>} [options] Namespace options
	* @property {Object.<string,AnyNestedObject>} [nested] Nested object descriptors
	*/
	/**
	* Any extension field descriptor.
	* @typedef AnyExtensionField
	* @type {IExtensionField|IExtensionMapField}
	*/
	/**
	* Any nested object descriptor.
	* @typedef AnyNestedObject
	* @type {IEnum|IType|IService|AnyExtensionField|INamespace|IOneOf}
	*/
	/**
	* Converts this namespace to a namespace descriptor.
	* @param {IToJSONOptions} [toJSONOptions] JSON conversion options
	* @returns {INamespace} Namespace descriptor
	*/
	Namespace.prototype.toJSON = function toJSON(toJSONOptions) {
		return util.toObject([
			"options",
			this.options,
			"nested",
			arrayToJSON(this.nestedArray, toJSONOptions)
		]);
	};
	/**
	* Adds nested objects to this namespace from nested object descriptors.
	* @param {Object.<string,AnyNestedObject>} nestedJson Any nested object descriptors
	* @param {number} [depth] Current nesting depth, defaults to `0`
	* @returns {Namespace} `this`
	*/
	Namespace.prototype.addJSON = function addJSON(nestedJson, depth) {
		if (depth === void 0) depth = 0;
		if (depth > util.recursionLimit) throw Error("max depth exceeded");
		var ns = this;
		/* istanbul ignore else */
		if (nestedJson) for (var names = Object.keys(nestedJson), i = 0, nested; i < names.length; ++i) {
			nested = nestedJson[names[i]];
			ns.add((nested.fields !== void 0 ? Type.fromJSON : nested.values !== void 0 ? Enum.fromJSON : nested.methods !== void 0 ? Service.fromJSON : nested.id !== void 0 ? Field.fromJSON : Namespace.fromJSON)(names[i], nested, depth + 1));
		}
		return this;
	};
	/**
	* Gets the nested object of the specified name.
	* @param {string} name Nested object name
	* @returns {ReflectionObject|null} The reflection object or `null` if it doesn't exist
	*/
	Namespace.prototype.get = function get(name) {
		return this.nested && Object.prototype.hasOwnProperty.call(this.nested, name) ? this.nested[name] : null;
	};
	/**
	* Gets the values of the nested {@link Enum|enum} of the specified name.
	* This methods differs from {@link Namespace#get|get} in that it returns an enum's values directly and throws instead of returning `null`.
	* @param {string} name Nested enum name
	* @returns {Object.<string,number>} Enum values
	* @throws {Error} If there is no such enum
	*/
	Namespace.prototype.getEnum = function getEnum(name) {
		if (this.nested && Object.prototype.hasOwnProperty.call(this.nested, name) && this.nested[name] instanceof Enum) return this.nested[name].values;
		throw Error("no such enum: " + name);
	};
	/**
	* Adds a nested object to this namespace.
	* @param {ReflectionObject} object Nested object to add
	* @returns {Namespace} `this`
	* @throws {TypeError} If arguments are invalid
	* @throws {Error} If there is already a nested object with this name
	*/
	Namespace.prototype.add = function add(object) {
		if (!(object instanceof Field && object.extend !== void 0 || object instanceof Type || object instanceof OneOf || object instanceof Enum || object instanceof Service || object instanceof Namespace)) throw TypeError("object must be a valid nested object");
		if (object.name === "__proto__") return this;
		if (!this.nested) this.nested = {};
		else {
			var prev = this.get(object.name);
			if (prev) {
				if (prev instanceof Namespace && object instanceof Namespace && !(prev instanceof Type || prev instanceof Service)) {
					var nested = prev.nestedArray;
					for (var i = 0; i < nested.length; ++i) object.add(nested[i]);
					this.remove(prev);
					if (!this.nested) this.nested = {};
					object.setOptions(prev.options, true);
				} else throw Error("duplicate name '" + object.name + "' in " + this);
			}
		}
		this.nested[object.name] = object;
		if (!(this instanceof Type || this instanceof Service || this instanceof Enum || this instanceof Field)) {
			if (!object._edition) object._edition = object._defaultEdition;
		}
		this._needsRecursiveFeatureResolution = true;
		this._needsRecursiveResolve = true;
		var parent = this;
		while (parent = parent.parent) {
			parent._needsRecursiveFeatureResolution = true;
			parent._needsRecursiveResolve = true;
		}
		object.onAdd(this);
		return clearCache(this);
	};
	/**
	* Removes a nested object from this namespace.
	* @param {ReflectionObject} object Nested object to remove
	* @returns {Namespace} `this`
	* @throws {TypeError} If arguments are invalid
	* @throws {Error} If `object` is not a member of this namespace
	*/
	Namespace.prototype.remove = function remove(object) {
		if (!(object instanceof ReflectionObject)) throw TypeError("object must be a ReflectionObject");
		if (object.parent !== this) throw Error(object + " is not a member of " + this);
		if (!util.remove(this.nested, object, object.name)) throw Error(object + " is not a member of " + this);
		if (!Object.keys(this.nested).length) this.nested = void 0;
		object.onRemove(this);
		return clearCache(this);
	};
	/**
	* Defines additial namespaces within this one if not yet existing.
	* @param {string|string[]} path Path to create
	* @param {*} [json] Nested types to create from JSON
	* @returns {Namespace} Pointer to the last namespace created or `this` if path is empty
	*/
	Namespace.prototype.define = function define(path, json) {
		if (util.isString(path)) path = path.split(".");
		else if (!Array.isArray(path)) throw TypeError("illegal path");
		if (path && path.length && path[0] === "") throw Error("path must be relative");
		if (path.length > util.recursionLimit) throw Error("max depth exceeded");
		var ptr = this;
		while (path.length > 0) {
			var part = path.shift();
			if (ptr.nested && ptr.nested[part]) {
				ptr = ptr.nested[part];
				if (!(ptr instanceof Namespace)) throw Error("path conflicts with non-namespace objects");
			} else ptr.add(ptr = new Namespace(part));
		}
		if (json) ptr.addJSON(json);
		return ptr;
	};
	/**
	* Resolves this namespace's and all its nested objects' type references. Useful to validate a reflection tree, but comes at a cost.
	* @returns {Namespace} `this`
	*/
	Namespace.prototype.resolveAll = function resolveAll() {
		if (!this._needsRecursiveResolve) return this;
		if (this._needsRecursiveFeatureResolution) this._resolveFeaturesRecursive(this._edition);
		var nested = this.nestedArray, i = 0;
		this.resolve();
		while (i < nested.length) if (nested[i] instanceof Namespace) nested[i++].resolveAll();
		else nested[i++].resolve();
		this._needsRecursiveResolve = false;
		return this;
	};
	/**
	* @override
	*/
	Namespace.prototype._resolveFeaturesRecursive = function _resolveFeaturesRecursive(edition) {
		if (!this._needsRecursiveFeatureResolution) return this;
		this._needsRecursiveFeatureResolution = false;
		edition = this._edition || edition;
		ReflectionObject.prototype._resolveFeaturesRecursive.call(this, edition);
		this.nestedArray.forEach((nested) => {
			nested._resolveFeaturesRecursive(edition);
		});
		return this;
	};
	/**
	* Recursively looks up the reflection object matching the specified path in the scope of this namespace.
	* @param {string|string[]} path Path to look up
	* @param {*|Array.<*>} filterTypes Filter types, any combination of the constructors of `protobuf.Type`, `protobuf.Enum`, `protobuf.Service` etc.
	* @param {boolean} [parentAlreadyChecked=false] If known, whether the parent has already been checked
	* @returns {ReflectionObject|null} Looked up object or `null` if none could be found
	*/
	Namespace.prototype.lookup = function lookup(path, filterTypes, parentAlreadyChecked) {
		/* istanbul ignore next */
		if (typeof filterTypes === "boolean") {
			parentAlreadyChecked = filterTypes;
			filterTypes = void 0;
		} else if (filterTypes && !Array.isArray(filterTypes)) filterTypes = [filterTypes];
		if (util.isString(path) && path.length) {
			if (path === ".") return this.root;
			path = path.split(".");
		} else if (!path.length) return this;
		var flatPath = path.join(".");
		if (path[0] === "") return this.root.lookup(path.slice(1), filterTypes);
		var found = this._lookupImpl(path, flatPath);
		if (found && (!filterTypes || filterTypes.indexOf(found.constructor) > -1)) return found;
		found = this.root._fullyQualifiedObjects && this.root._fullyQualifiedObjects["." + flatPath];
		if (found && (!filterTypes || filterTypes.indexOf(found.constructor) > -1)) return found;
		if (parentAlreadyChecked) return null;
		var current = this;
		while (current.parent) {
			found = current.parent._lookupImpl(path, flatPath);
			if (found && (!filterTypes || filterTypes.indexOf(found.constructor) > -1)) return found;
			current = current.parent;
		}
		return null;
	};
	/**
	* Internal helper for lookup that handles searching just at this namespace and below along with caching.
	* @param {string[]} path Path to look up
	* @param {string} flatPath Flattened version of the path to use as a cache key
	* @returns {ReflectionObject|null} Looked up object or `null` if none could be found
	* @private
	*/
	Namespace.prototype._lookupImpl = function lookup(path, flatPath) {
		if (Object.prototype.hasOwnProperty.call(this._lookupCache, flatPath)) return this._lookupCache[flatPath];
		var found = this.get(path[0]);
		var exact = null;
		if (found) {
			if (path.length === 1) exact = found;
			else if (found instanceof Namespace) {
				path = path.slice(1);
				exact = found._lookupImpl(path, path.join("."));
			}
		} else for (var i = 0; i < this.nestedArray.length; ++i) if (this._nestedArray[i] instanceof Namespace && (found = this._nestedArray[i]._lookupImpl(path, flatPath))) {
			exact = found;
			break;
		}
		this._lookupCache[flatPath] = exact;
		return exact;
	};
	/**
	* Looks up the reflection object at the specified path, relative to this namespace.
	* @name NamespaceBase#lookup
	* @function
	* @param {string|string[]} path Path to look up
	* @param {boolean} [parentAlreadyChecked=false] Whether the parent has already been checked
	* @returns {ReflectionObject|null} Looked up object or `null` if none could be found
	* @variation 2
	*/
	/**
	* Looks up the {@link Type|type} at the specified path, relative to this namespace.
	* Besides its signature, this methods differs from {@link Namespace#lookup|lookup} in that it throws instead of returning `null`.
	* @param {string|string[]} path Path to look up
	* @returns {Type} Looked up type
	* @throws {Error} If `path` does not point to a type
	*/
	Namespace.prototype.lookupType = function lookupType(path) {
		var found = this.lookup(path, [Type]);
		if (!found) throw Error("no such type: " + path);
		return found;
	};
	/**
	* Looks up the values of the {@link Enum|enum} at the specified path, relative to this namespace.
	* Besides its signature, this methods differs from {@link Namespace#lookup|lookup} in that it throws instead of returning `null`.
	* @param {string|string[]} path Path to look up
	* @returns {Enum} Looked up enum
	* @throws {Error} If `path` does not point to an enum
	*/
	Namespace.prototype.lookupEnum = function lookupEnum(path) {
		var found = this.lookup(path, [Enum]);
		if (!found) throw Error("no such Enum '" + path + "' in " + this);
		return found;
	};
	/**
	* Looks up the {@link Type|type} or {@link Enum|enum} at the specified path, relative to this namespace.
	* Besides its signature, this methods differs from {@link Namespace#lookup|lookup} in that it throws instead of returning `null`.
	* @param {string|string[]} path Path to look up
	* @returns {Type} Looked up type or enum
	* @throws {Error} If `path` does not point to a type or enum
	*/
	Namespace.prototype.lookupTypeOrEnum = function lookupTypeOrEnum(path) {
		var found = this.lookup(path, [Type, Enum]);
		if (!found) throw Error("no such Type or Enum '" + path + "' in " + this);
		return found;
	};
	/**
	* Looks up the {@link Service|service} at the specified path, relative to this namespace.
	* Besides its signature, this methods differs from {@link Namespace#lookup|lookup} in that it throws instead of returning `null`.
	* @param {string|string[]} path Path to look up
	* @returns {Service} Looked up service
	* @throws {Error} If `path` does not point to a service
	*/
	Namespace.prototype.lookupService = function lookupService(path) {
		var found = this.lookup(path, [Service]);
		if (!found) throw Error("no such Service '" + path + "' in " + this);
		return found;
	};
	Namespace._configure = function(Type_, Service_, Enum_) {
		Type = Type_;
		Service = Service_;
		Enum = Enum_;
	};
}));
//#endregion
//#region node_modules/protobufjs/src/mapfield.js
var require_mapfield = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = MapField;
	var Field = require_field();
	MapField.prototype = Object.create(Field.prototype, { constructor: {
		value: MapField,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	MapField.className = "MapField";
	var types = require_types();
	var util = require_util();
	/**
	* Constructs a new map field instance.
	* @classdesc Reflected map field.
	* @extends FieldBase
	* @constructor
	* @param {string} name Unique name within its namespace
	* @param {number} id Unique id within its namespace
	* @param {string} keyType Key type
	* @param {string} type Value type
	* @param {Object.<string,*>} [options] Declared options
	* @param {string} [comment] Comment associated with this field
	*/
	function MapField(name, id, keyType, type, options, comment) {
		Field.call(this, name, id, type, void 0, void 0, options, comment);
		/* istanbul ignore if */
		if (!util.isString(keyType)) throw TypeError("keyType must be a string");
		/**
		* Key type.
		* @type {string}
		*/
		this.keyType = keyType;
		/**
		* Resolved key type if not a basic type.
		* @type {ReflectionObject|null}
		*/
		this.resolvedKeyType = null;
		this.map = true;
	}
	/**
	* Map field descriptor.
	* @interface IMapField
	* @extends {IField}
	* @property {string} keyType Key type
	*/
	/**
	* Extension map field descriptor.
	* @interface IExtensionMapField
	* @extends IMapField
	* @property {string} extend Extended type
	*/
	/**
	* Constructs a map field from a map field descriptor.
	* @param {string} name Field name
	* @param {IMapField} json Map field descriptor
	* @returns {MapField} Created map field
	* @throws {TypeError} If arguments are invalid
	*/
	MapField.fromJSON = function fromJSON(name, json) {
		var field = new MapField(name, json.id, json.keyType, json.type, json.options, json.comment);
		if (json.protoName) field.protoName = json.protoName;
		if (json.jsonName !== void 0) field.jsonName = json.jsonName;
		else if (json.options && json.options.json_name !== void 0) field.jsonName = json.options.json_name;
		return field;
	};
	/**
	* Converts this map field to a map field descriptor.
	* @param {IToJSONOptions} [toJSONOptions] JSON conversion options
	* @returns {IMapField} Map field descriptor
	*/
	MapField.prototype.toJSON = function toJSON(toJSONOptions) {
		var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
		return util.toObject([
			"keyType",
			this.keyType,
			"type",
			this.type,
			"id",
			this.id,
			"extend",
			this.extend,
			"protoName",
			this.protoName !== this.name ? this.protoName : void 0,
			"jsonName",
			this.jsonName !== util.jsonName(this.protoName || this.name) ? this.jsonName : void 0,
			"options",
			this.options,
			"comment",
			keepComments ? this.comment : void 0
		]);
	};
	/**
	* @override
	*/
	MapField.prototype.resolve = function resolve() {
		if (this.resolved) return this;
		if (types.mapKey[this.keyType] === void 0) throw Error("invalid key type: " + this.keyType);
		return Field.prototype.resolve.call(this);
	};
	/**
	* Map field decorator (TypeScript).
	* @name MapField.d
	* @function
	* @param {number} fieldId Field id
	* @param {"int32"|"uint32"|"sint32"|"fixed32"|"sfixed32"|"int64"|"uint64"|"sint64"|"fixed64"|"sfixed64"|"bool"|"string"} fieldKeyType Field key type
	* @param {"double"|"float"|"int32"|"uint32"|"sint32"|"fixed32"|"sfixed32"|"int64"|"uint64"|"sint64"|"fixed64"|"sfixed64"|"bool"|"string"|"bytes"|Object|Constructor<{}>} fieldValueType Field value type
	* @returns {FieldDecorator} Decorator function
	* @template T extends { [key: string]: number | Long | string | boolean | Uint8Array | Buffer | number[] | Message<{}> }
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	MapField.d = function decorateMapField(fieldId, fieldKeyType, fieldValueType) {
		if (typeof fieldValueType === "function") fieldValueType = util.decorateType(fieldValueType).name;
		else if (fieldValueType && typeof fieldValueType === "object") fieldValueType = util.decorateEnum(fieldValueType).name;
		return function mapFieldDecorator(prototype, fieldName) {
			util.decorateType(prototype.constructor).add(new MapField(fieldName, fieldId, fieldKeyType, fieldValueType));
		};
	};
}));
//#endregion
//#region node_modules/protobufjs/src/method.js
var require_method = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Method;
	var ReflectionObject = require_object();
	Method.prototype = Object.create(ReflectionObject.prototype, { constructor: {
		value: Method,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	Method.className = "Method";
	var util = require_util();
	/**
	* Constructs a new service method instance.
	* @classdesc Reflected service method.
	* @extends ReflectionObject
	* @constructor
	* @param {string} name Method name
	* @param {string|undefined} type Method type, usually `"rpc"`
	* @param {string} requestType Request message type
	* @param {string} responseType Response message type
	* @param {boolean|Object.<string,*>} [requestStream] Whether the request is streamed
	* @param {boolean|Object.<string,*>} [responseStream] Whether the response is streamed
	* @param {Object.<string,*>} [options] Declared options
	* @param {string} [comment] The comment for this method
	* @param {Array.<Object.<string,*>>} [parsedOptions] Declared options, properly parsed into objects
	*/
	function Method(name, type, requestType, responseType, requestStream, responseStream, options, comment, parsedOptions) {
		/* istanbul ignore next */
		if (util.isObject(requestStream)) {
			options = requestStream;
			requestStream = responseStream = void 0;
		} else if (util.isObject(responseStream)) {
			options = responseStream;
			responseStream = void 0;
		}
		/* istanbul ignore if */
		if (!(type === void 0 || util.isString(type))) throw TypeError("type must be a string");
		/* istanbul ignore if */
		if (!util.isString(requestType)) throw TypeError("requestType must be a string");
		/* istanbul ignore if */
		if (!util.isString(responseType)) throw TypeError("responseType must be a string");
		ReflectionObject.call(this, name, options);
		/**
		* Method type.
		* @type {string}
		*/
		this.type = type || "rpc";
		/**
		* Request type.
		* @type {string}
		*/
		this.requestType = requestType;
		/**
		* Whether requests are streamed or not.
		* @type {true|undefined}
		*/
		this.requestStream = requestStream ? true : void 0;
		/**
		* Response type.
		* @type {string}
		*/
		this.responseType = responseType;
		/**
		* Whether responses are streamed or not.
		* @type {true|undefined}
		*/
		this.responseStream = responseStream ? true : void 0;
		/**
		* gRPC-style method path.
		* @type {string}
		*/
		this.path = "/" + this.name;
		/**
		* Resolved request type.
		* @type {Type|null}
		*/
		this.resolvedRequestType = null;
		/**
		* Resolved response type.
		* @type {Type|null}
		*/
		this.resolvedResponseType = null;
		/**
		* Comment for this method
		* @type {string|null}
		*/
		this.comment = comment;
		/**
		* Options properly parsed into objects
		* @type {Array.<Object.<string,*>>|undefined}
		*/
		this.parsedOptions = parsedOptions;
	}
	/**
	* Method descriptor.
	* @interface IMethod
	* @property {string} [type="rpc"] Method type
	* @property {string} requestType Request type
	* @property {string} responseType Response type
	* @property {boolean} [requestStream=false] Whether requests are streamed
	* @property {boolean} [responseStream=false] Whether responses are streamed
	* @property {Object.<string,*>} [options] Method options
	* @property {string|null} [comment] Method comment
	* @property {Array.<Object.<string,*>>} [parsedOptions] Method options properly parsed into objects
	*/
	/**
	* Constructs a method from a method descriptor.
	* @param {string} name Method name
	* @param {IMethod} json Method descriptor
	* @returns {Method} Created method
	* @throws {TypeError} If arguments are invalid
	*/
	Method.fromJSON = function fromJSON(name, json) {
		return new Method(name, json.type, json.requestType, json.responseType, json.requestStream, json.responseStream, json.options, json.comment, json.parsedOptions);
	};
	/**
	* Converts this method to a method descriptor.
	* @param {IToJSONOptions} [toJSONOptions] JSON conversion options
	* @returns {IMethod} Method descriptor
	*/
	Method.prototype.toJSON = function toJSON(toJSONOptions) {
		var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
		return util.toObject([
			"type",
			this.type !== "rpc" && /* istanbul ignore next */ this.type || void 0,
			"requestType",
			this.requestType,
			"requestStream",
			this.requestStream,
			"responseType",
			this.responseType,
			"responseStream",
			this.responseStream,
			"options",
			this.options,
			"comment",
			keepComments ? this.comment : void 0,
			"parsedOptions",
			this.parsedOptions
		]);
	};
	/**
	* @override
	*/
	Method.prototype.resolve = function resolve() {
		/* istanbul ignore if */
		if (this.resolved) return this;
		if (this.parent) {
			var serviceName = this.parent.fullName;
			if (serviceName.charAt(0) === ".") serviceName = serviceName.substring(1);
			this.path = "/" + serviceName + "/" + this.name;
		} else this.path = "/" + this.name;
		this.resolvedRequestType = this.parent.lookupType(this.requestType);
		this.resolvedResponseType = this.parent.lookupType(this.responseType);
		return ReflectionObject.prototype.resolve.call(this);
	};
}));
//#endregion
//#region node_modules/protobufjs/src/service.js
var require_service = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Service;
	var Namespace = require_namespace();
	Service.prototype = Object.create(Namespace.prototype, { constructor: {
		value: Service,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	Service.className = "Service";
	var Method = require_method();
	var util = require_util();
	var rpc = require_rpc();
	/**
	* Constructs a new service instance.
	* @classdesc Reflected service.
	* @extends NamespaceBase
	* @constructor
	* @param {string} name Service name
	* @param {Object.<string,*>} [options] Service options
	* @throws {TypeError} If arguments are invalid
	*/
	function Service(name, options) {
		Namespace.call(this, name, options);
		/**
		* Service methods.
		* @type {Object.<string,Method>}
		*/
		this.methods = {};
		/**
		* Cached methods as an array.
		* @type {Method[]|null}
		* @private
		*/
		this._methodsArray = null;
	}
	/**
	* Service descriptor.
	* @interface IService
	* @extends INamespace
	* @property {string} [edition] Edition
	* @property {Object.<string,IMethod>} methods Method descriptors
	* @property {string|null} [comment] Service comment
	*/
	/**
	* Constructs a service from a service descriptor.
	* @param {string} name Service name
	* @param {IService} json Service descriptor
	* @param {number} [depth] Current nesting depth, defaults to `0`
	* @returns {Service} Created service
	* @throws {TypeError} If arguments are invalid
	*/
	Service.fromJSON = function fromJSON(name, json, depth) {
		if (depth === void 0) depth = 0;
		if (depth > util.recursionLimit) throw Error("max depth exceeded");
		var service = new Service(name, json.options);
		/* istanbul ignore else */
		if (json.methods) for (var names = Object.keys(json.methods), i = 0; i < names.length; ++i) service.add(Method.fromJSON(names[i], json.methods[names[i]]));
		if (json.nested) service.addJSON(json.nested, depth);
		if (json.edition) service._edition = json.edition;
		service.comment = json.comment;
		service._defaultEdition = "proto3";
		return service;
	};
	/**
	* Converts this service to a service descriptor.
	* @param {IToJSONOptions} [toJSONOptions] JSON conversion options
	* @returns {IService} Service descriptor
	*/
	Service.prototype.toJSON = function toJSON(toJSONOptions) {
		var inherited = Namespace.prototype.toJSON.call(this, toJSONOptions);
		var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
		return util.toObject([
			"edition",
			this._editionToJSON(),
			"options",
			inherited && inherited.options || void 0,
			"methods",
			Namespace.arrayToJSON(this.methodsArray, toJSONOptions) || /* istanbul ignore next */ {},
			"nested",
			inherited && inherited.nested || void 0,
			"comment",
			keepComments ? this.comment : void 0
		]);
	};
	/**
	* Methods of this service as an array for iteration.
	* @name Service#methodsArray
	* @type {Method[]}
	* @readonly
	*/
	Object.defineProperty(Service.prototype, "methodsArray", { get: function() {
		return this._methodsArray || (this._methodsArray = util.toArray(this.methods));
	} });
	function clearCache(service) {
		service._methodsArray = null;
		return service;
	}
	/**
	* @override
	*/
	Service.prototype.get = function get(name) {
		return Object.prototype.hasOwnProperty.call(this.methods, name) ? this.methods[name] : Namespace.prototype.get.call(this, name);
	};
	/**
	* @override
	*/
	Service.prototype.resolveAll = function resolveAll() {
		if (!this._needsRecursiveResolve) return this;
		Namespace.prototype.resolve.call(this);
		var methods = this.methodsArray;
		for (var i = 0; i < methods.length; ++i) methods[i].resolve();
		return this;
	};
	/**
	* @override
	*/
	Service.prototype._resolveFeaturesRecursive = function _resolveFeaturesRecursive(edition) {
		if (!this._needsRecursiveFeatureResolution) return this;
		edition = this._edition || edition;
		Namespace.prototype._resolveFeaturesRecursive.call(this, edition);
		this.methodsArray.forEach((method) => {
			method._resolveFeaturesRecursive(edition);
		});
		return this;
	};
	/**
	* @override
	*/
	Service.prototype.add = function add(object) {
		/* istanbul ignore if */
		if (this.get(object.name)) throw Error("duplicate name '" + object.name + "' in " + this);
		if (object instanceof Method) {
			if (object.name === "__proto__") return this;
			this.methods[object.name] = object;
			object.parent = this;
			return clearCache(this);
		}
		return Namespace.prototype.add.call(this, object);
	};
	/**
	* @override
	*/
	Service.prototype.remove = function remove(object) {
		if (object instanceof Method) {
			/* istanbul ignore if */
			if (this.methods[object.name] !== object) throw Error(object + " is not a member of " + this);
			delete this.methods[object.name];
			object.parent = null;
			return clearCache(this);
		}
		return Namespace.prototype.remove.call(this, object);
	};
	/**
	* Creates a runtime service using the specified rpc implementation.
	* @param {RPCImpl} rpcImpl RPC implementation
	* @param {boolean} [requestDelimited=false] Whether requests are length-delimited
	* @param {boolean} [responseDelimited=false] Whether responses are length-delimited
	* @returns {rpc.Service} RPC service. Useful where requests and/or responses are streamed.
	*/
	Service.prototype.create = function create(rpcImpl, requestDelimited, responseDelimited) {
		var rpcService = new rpc.Service(rpcImpl, requestDelimited, responseDelimited);
		for (var i = 0, method; i < this.methodsArray.length; ++i) {
			var methodName = util.lcFirst((method = this._methodsArray[i]).resolve().name).replace(/[^$\w_]/g, "");
			rpcService[methodName] = (function(method, requestType, responseType) {
				return function rpcMethod(request, callback) {
					return rpc.Service.prototype.rpcCall.call(this, method, requestType, responseType, request, callback);
				};
			})(method, method.resolvedRequestType.ctor, method.resolvedResponseType.ctor);
		}
		return rpcService;
	};
}));
//#endregion
//#region node_modules/protobufjs/src/message.js
var require_message = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Message;
	var util = require_minimal();
	/**
	* Constructs a new message instance.
	* @classdesc Abstract runtime message.
	* @constructor
	* @param {Properties<T>} [properties] Properties to set
	* @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
	* @template T extends object = object
	*/
	function Message(properties) {
		if (properties) {
			for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i) if (properties[keys[i]] != null && keys[i] !== "__proto__") this[keys[i]] = properties[keys[i]];
		}
	}
	/**
	* Reference to the reflected type.
	* @name Message.$type
	* @type {Type}
	* @readonly
	*/
	/**
	* Reference to the reflected type.
	* @name Message#$type
	* @type {Type}
	* @readonly
	*/
	/**
	* Creates a new message of this type using the specified properties.
	* @param {Object.<string,*>} [properties] Properties to set
	* @returns {T} Message instance
	* @template T extends Message<T>
	* @this Constructor<T>
	*/
	Message.create = function create(properties) {
		return this.$type.create(properties);
	};
	/**
	* Encodes a message of this type.
	* @param {T|Object.<string,*>} message Message to encode
	* @param {Writer} [writer] Writer to use
	* @returns {Writer} Writer
	* @template T extends Message<T>
	* @this Constructor<T>
	*/
	Message.encode = function encode(message, writer) {
		return this.$type.encode(message, writer);
	};
	/**
	* Encodes a message of this type preceeded by its length as a varint.
	* @param {T|Object.<string,*>} message Message to encode
	* @param {Writer} [writer] Writer to use
	* @returns {Writer} Writer
	* @template T extends Message<T>
	* @this Constructor<T>
	*/
	Message.encodeDelimited = function encodeDelimited(message, writer) {
		return this.$type.encodeDelimited(message, writer);
	};
	/**
	* Decodes a message of this type.
	* @name Message.decode
	* @function
	* @param {Reader|Uint8Array} reader Reader or buffer to decode
	* @returns {T} Decoded message
	* @template T extends Message<T>
	* @this Constructor<T>
	*/
	Message.decode = function decode(reader) {
		return this.$type.decode(reader);
	};
	/**
	* Decodes a message of this type preceeded by its length as a varint.
	* @name Message.decodeDelimited
	* @function
	* @param {Reader|Uint8Array} reader Reader or buffer to decode
	* @returns {T} Decoded message
	* @template T extends Message<T>
	* @this Constructor<T>
	*/
	Message.decodeDelimited = function decodeDelimited(reader) {
		return this.$type.decodeDelimited(reader);
	};
	/**
	* Verifies a message of this type.
	* @name Message.verify
	* @function
	* @param {Object.<string,*>} message Plain object to verify
	* @returns {string|null} `null` if valid, otherwise the reason why it is not
	*/
	Message.verify = function verify(message) {
		return this.$type.verify(message);
	};
	/**
	* Creates a new message of this type from a plain object. Also converts values to their respective internal types.
	* @param {Object.<string,*>} object Plain object
	* @returns {T} Message instance
	* @template T extends Message<T>
	* @this Constructor<T>
	*/
	Message.fromObject = function fromObject(object) {
		return this.$type.fromObject(object);
	};
	/**
	* Creates a plain object from a message of this type. Also converts values to other types if specified.
	* @param {T} message Message instance
	* @param {IConversionOptions} [options] Conversion options
	* @returns {Object.<string,*>} Plain object
	* @template T extends Message<T>
	* @this Constructor<T>
	*/
	Message.toObject = function toObject(message, options) {
		return this.$type.toObject(message, options);
	};
	/**
	* Converts this message to JSON.
	* @returns {Object.<string,*>} JSON object
	*/
	Message.prototype.toJSON = function toJSON() {
		return this.$type.toObject(this, util.toJSONOptions);
	};
}));
//#endregion
//#region node_modules/protobufjs/src/decoder.js
var require_decoder = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = decoder;
	var Enum = require_enum();
	var types = require_types();
	var util = require_util();
	function missing(field) {
		return "missing required '" + field.name + "'";
	}
	function stringMethod(field) {
		return field._features.utf8_validation === "VERIFY" ? "stringVerify" : "string";
	}
	function genPreserveUnknown(gen, ref) {
		return gen("if(!r.discardUnknown){")("util.makeProp(m,\"$unknowns\",false);")("(m.$unknowns||(m.$unknowns=[])).push(%s)", ref)("}");
	}
	/**
	* Generates a decoder specific to the specified message type.
	* @param {Type} mtype Message type
	* @returns {Codegen} Codegen instance
	*/
	function decoder(mtype) {
		var hasMapField = false, needsValueVar = false, i = 0;
		for (; i < mtype.fieldsArray.length; ++i) {
			var pfield = mtype._fieldsArray[i];
			if (pfield.map) hasMapField = true;
			if (pfield.resolvedType instanceof Enum || !pfield.repeated && !pfield.map && !pfield.hasPresence) needsValueVar = true;
		}
		var gen = util.codegen([
			"r",
			"l",
			"z",
			"q",
			"g"
		])("if(!(r instanceof Reader))")("r=Reader.create(r)")("if(q===undefined)q=0")("if(q>Reader.recursionLimit)")("throw Error(\"max depth exceeded\")")("var c=l===undefined?r.len:r.pos+l,m=g||new C" + (hasMapField ? ",k,v" : needsValueVar ? ",v" : ""))("while(r.pos<c){")("var s=r.pos")("var t=r.tag()")("if(t===z){")("z=undefined")("break")("}");
		if (mtype.fieldsArray.length) gen("var u=t&7")("switch(t>>>=3){");
		for (i = 0; i < mtype.fieldsArray.length; ++i) {
			var field = mtype._fieldsArray[i].resolve(), type = field.resolvedType instanceof Enum ? "int32" : field.type, ref = "m" + util.safeProp(field.name), closed = field.resolvedType instanceof Enum && field.resolvedType._features.enum_type === "CLOSED";
			if (field.map) {
				gen("case %i:{", field.id)("if(u!==2)")("break");
				if (!closed) gen("if(%s===util.emptyObject)", ref)("%s={}", ref);
				gen("var c2=r.uint32()+r.pos");
				if (types.defaults[field.keyType] !== void 0) gen("k=%j", types.defaults[field.keyType]);
				else gen("k=null");
				if (types.long[type] !== void 0) gen("v=util.Long?util.Long.fromNumber(0,%j):0", type === "uint64" || type === "fixed64");
				else if (types.defaults[type] !== void 0) gen("v=%j", types.defaults[type]);
				else gen("v=null");
				gen("while(r.pos<c2){")("var t2=r.tag()")("u=t2&7")("switch(t2>>>=3){")("case 1:")("if(u!==%i)", types.mapKey[field.keyType])("break")("k=r.%s()", field.keyType === "string" ? stringMethod(field) : field.keyType)("continue")("case 2:")("if(u!==%i)", types.basic[type] === void 0 ? 2 : types.basic[type])("break");
				if (types.basic[type] === void 0) gen("v=types[%i].decode(r,r.uint32(),undefined,q+1,v)", i);
				else gen("v=r.%s()", type === "string" ? stringMethod(field) : type);
				gen("continue")("}")("r.skipType(u,q,t2)")("}");
				if (closed) {
					gen("if(types[%i].valuesById[v]===undefined){", i);
					genPreserveUnknown(gen, "r.raw(s,r.pos)")("continue")("}")("if(%s===util.emptyObject)", ref)("%s={}", ref);
				}
				var val = types.basic[type] === void 0 ? "v||new types[" + i + "].ctor" : "v";
				if (types.long[field.keyType] !== void 0) gen("%s[typeof k===\"object\"?util.longToHash(k):k]=%s", ref, val);
				else {
					if (field.keyType === "string") gen("if(k===\"__proto__\")")("util.makeProp(%s,k)", ref);
					gen("%s[k]=%s", ref, val);
				}
			} else if (field.repeated) {
				gen("case %i:", field.id)("{");
				if (types.packed[type] !== void 0) {
					gen("if(u===2){");
					if (closed) {
						gen("var c2=r.uint32()+r.pos")("while(r.pos<c2){")("s=r.pos")("v=r.%s()", type)("if(types[%i].valuesById[v]!==undefined){", i)("if(!(%s&&%s.length))", ref, ref)("%s=[]", ref)("%s.push(v)", ref)("}else");
						genPreserveUnknown(gen, "util.rawField(" + field.id + ",0,r.raw(s,r.pos))")("}");
					} else gen("if(!(%s&&%s.length))", ref, ref)("%s=[]", ref)("r.%ss(%s)", type, ref);
					gen("continue")("}");
				}
				gen("if(u!==%i)", types.basic[type] === void 0 ? field.delimited ? 3 : 2 : types.basic[type])("break");
				if (!closed) gen("if(!(%s&&%s.length))", ref, ref)("%s=[]", ref);
				if (types.basic[type] === void 0) {
					if (field.delimited) gen("%s.push(types[%i].decode(r,undefined,%i,q+1))", ref, i, field.id * 8 + 4);
					else gen("%s.push(types[%i].decode(r,r.uint32(),undefined,q+1))", ref, i);
				} else if (closed) {
					gen("v=r.%s()", type)("if(types[%i].valuesById[v]!==undefined){", i)("if(!(%s&&%s.length))", ref, ref)("%s=[]", ref)("%s.push(v)", ref)("}else");
					genPreserveUnknown(gen, "r.raw(s,r.pos)");
				} else gen("%s.push(r.%s())", ref, type === "string" ? stringMethod(field) : type);
			} else if (types.basic[type] === void 0) {
				gen("case %i:{", field.id)("if(u!==%i)", field.delimited ? 3 : 2)("break");
				if (field.delimited) gen("%s=types[%i].decode(r,undefined,%i,q+1,%s)", ref, i, field.id * 8 + 4, ref);
				else gen("%s=types[%i].decode(r,r.uint32(),undefined,q+1,%s)", ref, i, ref);
			} else if (field.hasPresence) {
				gen("case %i:{", field.id)("if(u!==%i)", types.basic[type])("break");
				if (closed) {
					gen("v=r.%s()", type)("if(types[%i].valuesById[v]!==undefined){", i)("%s=v", ref);
					if (field.partOf) gen("m%s=%j", util.safeProp(field.partOf.name), field.name);
					gen("}else");
					genPreserveUnknown(gen, "r.raw(s,r.pos)");
				} else gen("%s=r.%s()", ref, type === "string" ? stringMethod(field) : type);
			} else {
				gen("case %i:{", field.id)("if(u!==%i)", types.basic[type])("break");
				if (closed) {
					gen("v=r.%s()", type)("if(types[%i].valuesById[v]!==undefined){", i)("if(v!==%j)", field.typeDefault)("%s=v", ref)("else")("delete %s", ref)("}else{");
					genPreserveUnknown(gen, "r.raw(s,r.pos)")("}");
				} else {
					if (field.resolvedType instanceof Enum && field.typeDefault !== 0) gen("if((v=r.%s())!==%j)", type, field.typeDefault);
					else if (type === "string") gen("if((v=r.%s()).length)", stringMethod(field));
					else if (type === "bytes") gen("if((v=r.%s()).length)", type);
					else if (types.long[type] !== void 0) gen("if(typeof(v=r.%s())===\"object\"?v.low||v.high:v!==0)", type);
					else if (type === "double" || type === "float") gen("if(!Object.is(v=r.%s(),0))", type);
					else gen("if(v=r.%s())", type);
					gen("%s=v", ref)("else")("delete %s", ref);
				}
			}
			if (field.partOf && !closed) gen("m%s=%j", util.safeProp(field.partOf.name), field.name);
			gen("continue")("}");
		}
		if (i) gen("}");
		gen("r.skipType(%s,q,t)", i ? "u" : "t&7");
		genPreserveUnknown(gen, "r.raw(s,r.pos)")("}")("if(z!==undefined)")("throw Error(\"missing end group\")");
		for (i = 0; i < mtype._fieldsArray.length; ++i) {
			var rfield = mtype._fieldsArray[i];
			if (rfield.required) gen("if(!Object.hasOwnProperty.call(m,%j))", rfield.name)("throw util.ProtocolError(%j,{instance:m})", missing(rfield));
		}
		return gen("return m");
	}
}));
//#endregion
//#region node_modules/protobufjs/src/verifier.js
var require_verifier = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = verifier;
	var Enum = require_enum();
	var util = require_util();
	function invalid(field, expected) {
		return field.name + ": " + expected + (field.repeated && expected !== "array" ? "[]" : field.map && expected !== "object" ? "{k:" + field.keyType + "}" : "") + " expected";
	}
	/**
	* Generates a partial value verifier.
	* @param {Codegen} gen Codegen instance
	* @param {Field} field Reflected field
	* @param {number} fieldIndex Field index
	* @param {string} ref Variable reference
	* @returns {Codegen} Codegen instance
	* @ignore
	*/
	function genVerifyValue(gen, field, fieldIndex, ref) {
		var resolvedType = field.resolvedType;
		if (resolvedType) {
			if (resolvedType instanceof Enum) {
				if (resolvedType._features.enum_type === "CLOSED") {
					gen("switch(%s){", ref)("default:")("return%j", invalid(field, "enum value"));
					for (var keys = Object.keys(resolvedType.values), j = 0; j < keys.length; ++j) gen("case %i:", resolvedType.values[keys[j]]);
					gen("break")("}");
				} else gen("if(typeof %s!==\"number\"||(%s|0)!==%s)", ref, ref, ref)("return%j", invalid(field, "enum value"));
			} else gen("{")("var e=types[%i].verify(%s,q+1);", fieldIndex, ref)("if(e)")("return%j+e", field.name + ".")("}");
		} else switch (field.type) {
			case "int32":
			case "uint32":
			case "sint32":
			case "fixed32":
			case "sfixed32":
				gen("if(!util.isInteger(%s))", ref)("return%j", invalid(field, "integer"));
				break;
			case "int64":
			case "uint64":
			case "sint64":
			case "fixed64":
			case "sfixed64":
				gen("if(!util.isInteger(%s)&&!(%s&&util.isInteger(%s.low)&&util.isInteger(%s.high)))", ref, ref, ref, ref)("return%j", invalid(field, "integer|Long"));
				break;
			case "float":
			case "double":
				gen("if(typeof %s!==\"number\")", ref)("return%j", invalid(field, "number"));
				break;
			case "bool":
				gen("if(typeof %s!==\"boolean\")", ref)("return%j", invalid(field, "boolean"));
				break;
			case "string":
				gen("if(!util.isString(%s))", ref)("return%j", invalid(field, "string"));
				break;
			case "bytes": gen("if(!(%s&&typeof %s.length===\"number\"||util.isString(%s)))", ref, ref, ref)("return%j", invalid(field, "buffer"));
		}
		return gen;
	}
	/**
	* Generates a partial key verifier.
	* @param {Codegen} gen Codegen instance
	* @param {Field} field Reflected field
	* @param {string} ref Variable reference
	* @returns {Codegen} Codegen instance
	* @ignore
	*/
	function genVerifyKey(gen, field, ref) {
		switch (field.keyType) {
			case "int32":
			case "uint32":
			case "sint32":
			case "fixed32":
			case "sfixed32":
				gen("if(!util.key32Re.test(%s))", ref)("return%j", invalid(field, "integer key"));
				break;
			case "int64":
			case "uint64":
			case "sint64":
			case "fixed64":
			case "sfixed64":
				gen("if(!util.key64Re.test(%s))", ref)("return%j", invalid(field, "integer|Long key"));
				break;
			case "bool": gen("if(!util.key2Re.test(%s))", ref)("return%j", invalid(field, "boolean key"));
		}
		return gen;
	}
	/**
	* Generates a verifier specific to the specified message type.
	* @param {Type} mtype Message type
	* @returns {Codegen} Codegen instance
	*/
	function verifier(mtype) {
		var gen = util.codegen(["m", "q"])("if(typeof m!==\"object\"||m===null)")("return%j", "object expected")("if(q===undefined)q=0")("if(q>util.recursionLimit)")("return%j", "max depth exceeded");
		var oneofs = mtype.oneofsArray, seenFirstField = {};
		if (oneofs.length) gen("var p={}");
		for (var i = 0; i < mtype.fieldsArray.length; ++i) {
			var field = mtype._fieldsArray[i].resolve(), ref = "m" + util.safeProp(field.name);
			if (field.optional) gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)){", ref, field.name);
			if (field.map) {
				gen("if(!util.isObject(%s))", ref)("return%j", invalid(field, "object"))("var k=Object.keys(%s)", ref)("for(var i=0;i<k.length;++i){");
				genVerifyKey(gen, field, "k[i]");
				genVerifyValue(gen, field, i, ref + "[k[i]]")("}");
			} else if (field.repeated) {
				gen("if(!Array.isArray(%s))", ref)("return%j", invalid(field, "array"))("for(var i=0;i<%s.length;++i){", ref);
				genVerifyValue(gen, field, i, ref + "[i]")("}");
			} else {
				if (field.partOf) {
					var oneofProp = util.safeProp(field.partOf.name);
					if (seenFirstField[field.partOf.name] === 1) gen("if(p%s===1)", oneofProp)("return%j", field.partOf.name + ": multiple values");
					seenFirstField[field.partOf.name] = 1;
					gen("p%s=1", oneofProp);
				}
				genVerifyValue(gen, field, i, ref);
			}
			if (field.optional) gen("}");
		}
		return gen("return null");
	}
}));
//#endregion
//#region node_modules/protobufjs/src/converter.js
var require_converter = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Runtime message from/to plain object converters.
	* @namespace
	*/
	var converter = exports;
	var Enum = require_enum();
	var types = require_types();
	var util = require_util();
	/**
	* Generates a partial value fromObject conveter.
	* @param {Codegen} gen Codegen instance
	* @param {Field} field Reflected field
	* @param {number} fieldIndex Field index
	* @param {string} prop Property reference
	* @param {string} [dstProp] Repeated destination property reference
	* @returns {Codegen} Codegen instance
	* @ignore
	*/
	function genValuePartial_fromObject(gen, field, fieldIndex, prop, dstProp) {
		if (field.resolvedType) {
			if (field.resolvedType instanceof Enum) {
				var dst = dstProp ? "m" + dstProp + "[m" + dstProp + ".length]" : "m" + prop;
				gen("switch(d%s){", prop);
				for (var values = field.resolvedType.values, keys = Object.keys(values), i = 0; i < keys.length; ++i) gen("case%j:", keys[i])("case %i:", values[keys[i]])("%s=%j", dst, values[keys[i]])("break");
				gen("default:");
				if (field.resolvedType._features.enum_type !== "CLOSED") gen("if(typeof d%s===\"number\"&&(d%s|0)===d%s)", prop, prop, prop)("%s=d%s", dst, prop);
				gen("}");
			} else gen("if(!util.isObject(d%s))", prop)("throw TypeError(%j)", field.fullName + ": object expected")("m%s=types[%i].fromObject(d%s,q+1)", prop, fieldIndex, prop);
		} else {
			var isUnsigned = false;
			switch (field.type) {
				case "double":
				case "float":
					gen("m%s=Number(d%s)", prop, prop);
					break;
				case "uint32":
				case "fixed32":
					gen("m%s=d%s>>>0", prop, prop);
					break;
				case "int32":
				case "sint32":
				case "sfixed32":
					gen("m%s=d%s|0", prop, prop);
					break;
				case "uint64":
				case "fixed64": isUnsigned = true;
				case "int64":
				case "sint64":
				case "sfixed64":
					gen("if(util.Long)")("m%s=util.Long.fromValue(d%s,%j)", prop, prop, isUnsigned)("else if(typeof d%s===\"string\")", prop)("m%s=parseInt(d%s,10)", prop, prop)("else if(typeof d%s===\"number\")", prop)("m%s=d%s", prop, prop)("else if(typeof d%s===\"object\")", prop)("m%s=new util.LongBits(d%s.low>>>0,d%s.high>>>0).toNumber(%s)", prop, prop, prop, isUnsigned ? "true" : "");
					break;
				case "bytes":
					gen("if(typeof d%s===\"string\")", prop)("util.base64.decode(d%s,m%s=util.newBuffer(util.base64.length(d%s)),0)", prop, prop, prop)("else if(d%s.length>=0)", prop)("m%s=d%s", prop, prop);
					break;
				case "string":
					gen("m%s=String(d%s)", prop, prop);
					break;
				case "bool": gen("m%s=Boolean(d%s)", prop, prop);
			}
		}
		return gen;
	}
	/**
	* Generates a plain object to runtime message converter specific to the specified message type.
	* @param {Type} mtype Message type
	* @returns {Codegen} Codegen instance
	*/
	converter.fromObject = function fromObject(mtype) {
		var fields = mtype.fieldsArray;
		var gen = util.codegen(["d", "q"])("if(d instanceof C)")("return d")("if(!util.isObject(d))")("throw TypeError(%j)", mtype.fullName + ": object expected")("if(q===undefined)q=0")("if(q>util.recursionLimit)")("throw Error(\"max depth exceeded\")");
		if (!fields.length) return gen("return new C");
		gen("var m=new C");
		for (var i = 0; i < fields.length; ++i) {
			var field = fields[i].resolve(), prop = util.safeProp(field.name), implicitPresence = !field.hasPresence && !field.repeated && !field.map && (field.resolvedType instanceof Enum || types.basic[field.type] !== void 0);
			if (field.map) {
				gen("if(d%s){", prop)("if(!util.isObject(d%s))", prop)("throw TypeError(%j)", field.fullName + ": object expected")("m%s={}", prop)("for(var ks=Object.keys(d%s),i=0;i<ks.length;++i){", prop);
				gen("if(ks[i]===\"__proto__\")")("util.makeProp(m%s,ks[i])", prop);
				genValuePartial_fromObject(gen, field, i, prop + "[ks[i]]")("}")("}");
			} else if (field.repeated) {
				gen("if(d%s){", prop)("if(!Array.isArray(d%s))", prop)("throw TypeError(%j)", field.fullName + ": array expected");
				if (field.resolvedType instanceof Enum) gen("m%s=[]", prop);
				else gen("m%s=Array(d%s.length)", prop, prop);
				gen("for(var i=0;i<d%s.length;++i){", prop);
				genValuePartial_fromObject(gen, field, i, prop + "[i]", field.resolvedType instanceof Enum ? prop : void 0)("}")("}");
			} else {
				if (!(field.resolvedType instanceof Enum)) gen("if(d%s!=null){", prop);
				if (implicitPresence) {
					if (field.resolvedType instanceof Enum) gen("if(d%s!==%j&&(typeof d%s!==\"string\"||types[%i].values[d%s]!==%j)){", prop, field.typeDefault, prop, i, prop, field.typeDefault);
					else if (field.type === "string") gen("if(typeof d%s!==\"string\"||d%s.length){", prop, prop);
					else if (field.type === "bytes") gen("if(d%s.length){", prop);
					else if (field.type === "bool") gen("if(d%s){", prop);
					else if (field.type === "double" || field.type === "float") gen("if(!Object.is(Number(d%s),0)){", prop);
					else if (types.long[field.type] !== void 0) gen("if(typeof d%s===\"object\"?d%s.low||d%s.high:Number(d%s)!==0){", prop, prop, prop, prop);
					else gen("if(Number(d%s)!==0){", prop);
				}
				genValuePartial_fromObject(gen, field, i, prop);
				if (implicitPresence) gen("}");
				if (!(field.resolvedType instanceof Enum)) gen("}");
			}
		}
		return gen("return m");
	};
	/**
	* Generates a partial value toObject converter.
	* @param {Codegen} gen Codegen instance
	* @param {Field} field Reflected field
	* @param {number} fieldIndex Field index
	* @param {string} dstProp Destination property reference
	* @param {string} [srcProp] Source property reference
	* @returns {Codegen} Codegen instance
	* @ignore
	*/
	function genValuePartial_toObject(gen, field, fieldIndex, dstProp, srcProp) {
		if (!srcProp) srcProp = dstProp;
		if (field.resolvedType) {
			if (field.resolvedType instanceof Enum) gen("d%s=o.enums===String?(types[%i].values[m%s]===undefined?m%s:types[%i].values[m%s]):m%s", dstProp, fieldIndex, srcProp, srcProp, fieldIndex, srcProp, srcProp);
			else gen("d%s=types[%i].toObject(m%s,o,q+1)", dstProp, fieldIndex, srcProp);
		} else {
			var isUnsigned = false;
			switch (field.type) {
				case "double":
				case "float":
					gen("d%s=o.json&&!isFinite(m%s)?String(m%s):m%s", dstProp, srcProp, srcProp, srcProp);
					break;
				case "uint64":
				case "fixed64": isUnsigned = true;
				case "int64":
				case "sint64":
				case "sfixed64":
					gen("if(typeof BigInt!==\"undefined\"&&o.longs===BigInt)")("d%s=typeof m%s===\"number\"?BigInt(m%s):util.Long.fromBits(m%s.low>>>0,m%s.high>>>0,%j).toBigInt()", dstProp, srcProp, srcProp, srcProp, srcProp, isUnsigned)("else if(typeof m%s===\"number\")", srcProp)("d%s=o.longs===String?String(m%s):m%s", dstProp, srcProp, srcProp)("else")("d%s=o.longs===String?util.Long.prototype.toString.call(m%s):o.longs===Number?new util.LongBits(m%s.low>>>0,m%s.high>>>0).toNumber(%s):m%s", dstProp, srcProp, srcProp, srcProp, isUnsigned ? "true" : "", srcProp);
					break;
				case "bytes":
					gen("d%s=o.bytes===String?util.base64.encode(m%s,0,m%s.length):o.bytes===Array?Array.prototype.slice.call(m%s):m%s", dstProp, srcProp, srcProp, srcProp, srcProp);
					break;
				default: gen("d%s=m%s", dstProp, srcProp);
			}
		}
		return gen;
	}
	/**
	* Generates a runtime message to plain object converter specific to the specified message type.
	* @param {Type} mtype Message type
	* @returns {Codegen} Codegen instance
	*/
	converter.toObject = function toObject(mtype) {
		var fields = mtype.fieldsArray.slice().sort(util.compareFieldsById);
		if (!fields.length) return util.codegen()("return {}");
		var gen = util.codegen([
			"m",
			"o",
			"q"
		])("if(!o)")("o={}")("if(q===undefined)q=0")("if(q>util.recursionLimit)")("throw Error(\"max depth exceeded\")")("var d={}");
		var repeatedFields = [], mapFields = [], normalFields = [], i = 0;
		for (; i < fields.length; ++i) if (!fields[i].partOf) (fields[i].resolve().repeated ? repeatedFields : fields[i].map ? mapFields : normalFields).push(fields[i]);
		if (repeatedFields.length) {
			gen("if(o.arrays||o.defaults){");
			for (i = 0; i < repeatedFields.length; ++i) gen("d%s=[]", util.safeProp(repeatedFields[i].name));
			gen("}");
		}
		if (mapFields.length) {
			gen("if(o.objects||o.defaults){");
			for (i = 0; i < mapFields.length; ++i) gen("d%s={}", util.safeProp(mapFields[i].name));
			gen("}");
		}
		if (normalFields.length) {
			gen("if(o.defaults){");
			for (i = 0; i < normalFields.length; ++i) {
				var field = normalFields[i], prop = util.safeProp(field.name);
				if (field.resolvedType instanceof Enum) gen("d%s=o.enums===String?%j:%j", prop, field.resolvedType.valuesById[field.typeDefault], field.typeDefault);
				else if (field.long) gen("if(util.Long){")("var n=new util.Long(%i,%i,%j)", field.typeDefault.low, field.typeDefault.high, field.typeDefault.unsigned)("d%s=o.longs===String?n.toString():o.longs===Number?n.toNumber():typeof BigInt!==\"undefined\"&&o.longs===BigInt?n.toBigInt():n", prop)("}else")("d%s=o.longs===String?%j:typeof BigInt!==\"undefined\"&&o.longs===BigInt?BigInt(%j):%i", prop, field.typeDefault.toString(), field.typeDefault.toString(), field.typeDefault.toNumber());
				else if (field.bytes) {
					var arrayDefault = Array.prototype.slice.call(field.typeDefault);
					gen("if(o.bytes===String)d%s=%j", prop, util.base64.encode(field.typeDefault, 0, field.typeDefault.length))("else{")("d%s=%j", prop, arrayDefault)("if(o.bytes!==Array)d%s=util.newBuffer(d%s)", prop, prop)("}");
				} else if ((field.type === "double" || field.type === "float") && typeof field.typeDefault === "number" && (!isFinite(field.typeDefault) || Object.is(field.typeDefault, -0))) gen("d%s=%f", prop, field.typeDefault)("if(o.json&&!isFinite(d%s))d%s=String(d%s)", prop, prop, prop);
				else gen("d%s=%j", prop, field.typeDefault);
			}
			gen("}");
		}
		var hasKs2 = false;
		for (i = 0; i < fields.length; ++i) {
			var field = fields[i], index = mtype._fieldsArray.indexOf(field), prop = util.safeProp(field.name);
			if (field.map) {
				if (!hasKs2) {
					hasKs2 = true;
					gen("var ks2");
				}
				gen("if(m%s&&(ks2=Object.keys(m%s)).length){", prop, prop)("d%s={}", prop);
				var longKey = types.long[field.keyType] !== void 0, srcProp = prop + "[ks2[j]]";
				gen("for(var j=0;j<ks2.length;++j){");
				if (longKey) gen("var k2=util.longFromKey(ks2[j],%j).toString()", field.keyType === "uint64" || field.keyType === "fixed64");
				gen("if(ks2[j]===\"__proto__\")")("util.makeProp(d%s,ks2[j])", prop);
				genValuePartial_toObject(gen, field, index, longKey ? prop + "[k2]" : srcProp, srcProp)("}");
			} else if (field.repeated) {
				gen("if(m%s&&m%s.length){", prop, prop)("d%s=Array(m%s.length)", prop, prop)("for(var j=0;j<m%s.length;++j){", prop);
				genValuePartial_toObject(gen, field, index, prop + "[j]")("}");
			} else {
				gen("if(m%s!=null&&Object.hasOwnProperty.call(m,%j)){", prop, field.name);
				genValuePartial_toObject(gen, field, index, prop);
				if (field.partOf && !field.partOf.isProto3Optional) gen("if(o.oneofs)")("d%s=%j", util.safeProp(field.partOf.name), field.name);
			}
			gen("}");
		}
		return gen("return d");
	};
}));
//#endregion
//#region node_modules/protobufjs/src/wrappers.js
var require_wrappers = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Wrappers for common types.
	* @type {Object.<string,IWrapper>}
	* @const
	*/
	var wrappers = exports;
	var Message = require_message();
	var util = require_minimal();
	/**
	* From object converter part of an {@link IWrapper}.
	* @typedef WrapperFromObjectConverter
	* @type {function}
	* @param {Object.<string,*>} object Plain object
	* @returns {Message<{}>} Message instance
	* @this Type
	*/
	/**
	* To object converter part of an {@link IWrapper}.
	* @typedef WrapperToObjectConverter
	* @type {function}
	* @param {Message<{}>} message Message instance
	* @param {IConversionOptions} [options] Conversion options
	* @returns {Object.<string,*>} Plain object
	* @this Type
	*/
	/**
	* Common type wrapper part of {@link wrappers}.
	* @interface IWrapper
	* @property {WrapperFromObjectConverter} [fromObject] From object converter
	* @property {WrapperToObjectConverter} [toObject] To object converter
	*/
	wrappers[".google.protobuf.Any"] = {
		fromObject: function(object, depth) {
			if (object && object["@type"]) {
				var name = object["@type"].substring(object["@type"].lastIndexOf("/") + 1);
				var type = this.lookup(name, [this.constructor]);
				/* istanbul ignore else */
				if (type) {
					var type_url = object["@type"].charAt(0) === "." ? object["@type"].slice(1) : object["@type"];
					if (type_url.indexOf("/") === -1) type_url = "/" + type_url;
					return this.create({
						type_url,
						value: type.encode(type.fromObject(object, depth === void 0 ? 1 : depth + 1)).finish()
					});
				}
			}
			return this.fromObject(object, depth);
		},
		toObject: function(message, options, depth) {
			if (depth === void 0) depth = 0;
			if (depth > util.recursionLimit) throw Error("max depth exceeded");
			var googleApi = "type.googleapis.com/";
			var prefix = "";
			var name = "";
			if (options && options.json && message.type_url && message.value) {
				name = message.type_url.substring(message.type_url.lastIndexOf("/") + 1);
				prefix = message.type_url.substring(0, message.type_url.lastIndexOf("/") + 1);
				var type = this.lookup(name, [this.constructor]);
				/* istanbul ignore else */
				if (type) message = type.decode(message.value, void 0, void 0, depth + 1);
			}
			if (!(message instanceof this.ctor) && message instanceof Message) {
				var object = message.$type.toObject(message, options, depth + 1);
				var messageName = message.$type.fullName[0] === "." ? message.$type.fullName.slice(1) : message.$type.fullName;
				if (prefix === "") prefix = googleApi;
				name = prefix + messageName;
				object["@type"] = name;
				return object;
			}
			return this.toObject(message, options, depth);
		}
	};
}));
//#endregion
//#region node_modules/protobufjs/src/type.js
var require_type = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Type;
	var Namespace = require_namespace();
	Type.prototype = Object.create(Namespace.prototype, { constructor: {
		value: Type,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	Type.className = "Type";
	var Enum = require_enum();
	var OneOf = require_oneof();
	var Field = require_field();
	var MapField = require_mapfield();
	var Service = require_service();
	var Message = require_message();
	var Reader = require_reader();
	var Writer = require_writer();
	var util = require_util();
	var encoder = require_encoder();
	var decoder = require_decoder();
	var verifier = require_verifier();
	var converter = require_converter();
	var wrappers = require_wrappers();
	/**
	* Constructs a new reflected message type instance.
	* @classdesc Reflected message type.
	* @extends NamespaceBase
	* @constructor
	* @param {string} name Message name
	* @param {Object.<string,*>} [options] Declared options
	*/
	function Type(name, options) {
		name = name.replace(/\W/g, "");
		Namespace.call(this, name, options);
		/**
		* Message fields.
		* @type {Object.<string,Field>}
		*/
		this.fields = {};
		/**
		* Oneofs declared within this namespace, if any.
		* @type {Object.<string,OneOf>}
		*/
		this.oneofs = void 0;
		/**
		* Extension ranges, if any.
		* @type {number[][]}
		*/
		this.extensions = void 0;
		/**
		* Reserved ranges, if any.
		* @type {Array.<number[]|string>}
		*/
		this.reserved = void 0;
		this.group = void 0;
		/**
		* Cached fields by id.
		* @type {Object.<number,Field>|null}
		* @private
		*/
		this._fieldsById = null;
		/**
		* Cached fields as an array.
		* @type {Field[]|null}
		* @private
		*/
		this._fieldsArray = null;
		/**
		* Cached oneofs as an array.
		* @type {OneOf[]|null}
		* @private
		*/
		this._oneofsArray = null;
		/**
		* Cached constructor.
		* @type {Constructor<{}>}
		* @private
		*/
		this._ctor = null;
		/**
		* Cached fields by JSON name.
		* @type {Object.<string,Field>|null}
		* @private
		*/
		this._fieldsByJsonName = null;
	}
	Object.defineProperties(Type.prototype, {
		/**
		* Message fields by id.
		* @name Type#fieldsById
		* @type {Object.<number,Field>}
		* @readonly
		*/
		fieldsById: { get: function() {
			/* istanbul ignore if */
			if (this._fieldsById) return this._fieldsById;
			this._fieldsById = {};
			for (var names = Object.keys(this.fields), i = 0; i < names.length; ++i) {
				var field = this.fields[names[i]], id = field.id;
				/* istanbul ignore if */
				if (this._fieldsById[id]) throw Error("duplicate id " + id + " in " + this);
				this._fieldsById[id] = field;
			}
			return this._fieldsById;
		} },
		/**
		* Fields of this message as an array for iteration.
		* @name Type#fieldsArray
		* @type {Field[]}
		* @readonly
		*/
		fieldsArray: { get: function() {
			return this._fieldsArray || (this._fieldsArray = util.toArray(this.fields));
		} },
		/**
		* Oneofs of this message as an array for iteration.
		* @name Type#oneofsArray
		* @type {OneOf[]}
		* @readonly
		*/
		oneofsArray: { get: function() {
			return this._oneofsArray || (this._oneofsArray = util.toArray(this.oneofs));
		} },
		/**
		* The registered constructor, if any registered, otherwise a generic constructor.
		* Assigning a function replaces the internal constructor. If the function does not extend {@link Message} yet, its prototype will be setup accordingly and static methods will be populated. If it already extends {@link Message}, it will just replace the internal constructor.
		* When assigning manually, add the type to its parent namespace/root first if fields reference other reflected types, because constructor setup resolves field defaults.
		* @name Type#ctor
		* @type {Constructor<{}>}
		*/
		ctor: {
			get: function() {
				return this._ctor || (this.ctor = Type.generateConstructor(this)());
			},
			set: function(ctor) {
				var prototype = ctor.prototype;
				if (!(prototype instanceof Message)) {
					ctor.prototype = new Message();
					Object.defineProperty(ctor.prototype, "constructor", {
						value: ctor,
						writable: true,
						enumerable: false,
						configurable: true
					});
					util.merge(ctor.prototype, prototype);
				}
				ctor.$type = ctor.prototype.$type = this;
				util.merge(ctor, Message, true);
				this._ctor = ctor;
				delete this.decode;
				delete this.fromObject;
				var i = 0;
				for (var field; i < this.fieldsArray.length; ++i) {
					field = this._fieldsArray[i].resolve();
					ctor.prototype[field.name] = field.defaultValue;
				}
				var ctorProperties = {};
				for (i = 0; i < this.oneofsArray.length; ++i) ctorProperties[this._oneofsArray[i].resolve().name] = {
					get: util.oneOfGetter(this._oneofsArray[i].oneof),
					set: util.oneOfSetter(this._oneofsArray[i].oneof)
				};
				if (i) Object.defineProperties(ctor.prototype, ctorProperties);
			}
		}
	});
	/**
	* Generates a constructor function for the specified type.
	* @param {Type} mtype Message type
	* @returns {Codegen} Codegen instance
	*/
	Type.generateConstructor = function generateConstructor(mtype) {
		var gen = util.codegen(["p"]);
		for (var i = 0, field; i < mtype.fieldsArray.length; ++i) if ((field = mtype._fieldsArray[i]).map) gen("this%s={}", util.safeProp(field.name));
		else if (field.repeated) gen("this%s=[]", util.safeProp(field.name));
		return gen("if(p)for(var ks=Object.keys(p),i=0;i<ks.length;++i)if(p[ks[i]]!=null&&ks[i]!==\"__proto__\")")("this[ks[i]]=p[ks[i]]");
	};
	function clearCache(type) {
		type._fieldsById = type._fieldsArray = type._oneofsArray = type._fieldsByJsonName = null;
		delete type.encode;
		delete type.decode;
		delete type.verify;
		return type;
	}
	/**
	* Message type descriptor.
	* @interface IType
	* @extends INamespace
	* @property {string} [edition] Edition
	* @property {Object.<string,IOneOf>} [oneofs] Oneof descriptors
	* @property {Object.<string,IField>} fields Field descriptors
	* @property {number[][]} [extensions] Extension ranges
	* @property {Array.<number[]|string>} [reserved] Reserved ranges
	* @property {boolean} [group=false] Whether a legacy group or not
	* @property {string|null} [comment] Message type comment
	*/
	/**
	* Creates a message type from a message type descriptor.
	* @param {string} name Message name
	* @param {IType} json Message type descriptor
	* @param {number} [depth] Current nesting depth, defaults to `0`
	* @returns {Type} Created message type
	*/
	Type.fromJSON = function fromJSON(name, json, depth) {
		if (depth === void 0) depth = 0;
		if (depth > util.nestingLimit) throw Error("max depth exceeded");
		var type = new Type(name, json.options);
		type.extensions = json.extensions;
		type.reserved = json.reserved;
		var names = Object.keys(json.fields), i = 0;
		for (; i < names.length; ++i) type.add((typeof json.fields[names[i]].keyType !== "undefined" ? MapField.fromJSON : Field.fromJSON)(names[i], json.fields[names[i]]));
		if (json.oneofs) for (names = Object.keys(json.oneofs), i = 0; i < names.length; ++i) type.add(OneOf.fromJSON(names[i], json.oneofs[names[i]]));
		if (json.nested) for (names = Object.keys(json.nested), i = 0; i < names.length; ++i) {
			var nested = json.nested[names[i]];
			type.add((nested.id !== void 0 ? Field.fromJSON : nested.fields !== void 0 ? Type.fromJSON : nested.values !== void 0 ? Enum.fromJSON : nested.methods !== void 0 ? Service.fromJSON : Namespace.fromJSON)(names[i], nested, depth + 1));
		}
		if (json.extensions && json.extensions.length) type.extensions = json.extensions;
		if (json.reserved && json.reserved.length) type.reserved = json.reserved;
		if (json.group) type.group = true;
		if (json.comment) type.comment = json.comment;
		if (json.edition) type._edition = json.edition;
		type._defaultEdition = "proto3";
		return type;
	};
	/**
	* Converts this message type to a message type descriptor.
	* @param {IToJSONOptions} [toJSONOptions] JSON conversion options
	* @returns {IType} Message type descriptor
	*/
	Type.prototype.toJSON = function toJSON(toJSONOptions) {
		var inherited = Namespace.prototype.toJSON.call(this, toJSONOptions);
		var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
		return util.toObject([
			"edition",
			this._editionToJSON(),
			"options",
			inherited && inherited.options || void 0,
			"oneofs",
			Namespace.arrayToJSON(this.oneofsArray, toJSONOptions),
			"fields",
			Namespace.arrayToJSON(this.fieldsArray.filter(function(obj) {
				return !obj.declaringField;
			}), toJSONOptions) || {},
			"extensions",
			this.extensions && this.extensions.length ? this.extensions : void 0,
			"reserved",
			this.reserved && this.reserved.length ? this.reserved : void 0,
			"group",
			this.group || void 0,
			"nested",
			inherited && inherited.nested || void 0,
			"comment",
			keepComments ? this.comment : void 0
		]);
	};
	/**
	* @override
	*/
	Type.prototype.resolveAll = function resolveAll() {
		if (!this._needsRecursiveResolve) return this;
		Namespace.prototype.resolveAll.call(this);
		var oneofs = this.oneofsArray;
		i = 0;
		while (i < oneofs.length) oneofs[i++].resolve();
		var fields = this.fieldsArray, i = 0;
		while (i < fields.length) fields[i++].resolve();
		return this;
	};
	/**
	* @override
	*/
	Type.prototype._resolveFeaturesRecursive = function _resolveFeaturesRecursive(edition) {
		if (!this._needsRecursiveFeatureResolution) return this;
		edition = this._edition || edition;
		Namespace.prototype._resolveFeaturesRecursive.call(this, edition);
		this.oneofsArray.forEach((oneof) => {
			oneof._resolveFeatures(edition);
		});
		this.fieldsArray.forEach((field) => {
			field._resolveFeatures(edition);
		});
		return this;
	};
	/**
	* @override
	*/
	Type.prototype.get = function get(name) {
		if (Object.prototype.hasOwnProperty.call(this.fields, name)) return this.fields[name];
		if (this.oneofs && Object.prototype.hasOwnProperty.call(this.oneofs, name)) return this.oneofs[name];
		if (this.nested && Object.prototype.hasOwnProperty.call(this.nested, name)) return this.nested[name];
		return null;
	};
	/**
	* Adds a nested object to this type.
	* @param {ReflectionObject} object Nested object to add
	* @returns {Type} `this`
	* @throws {TypeError} If arguments are invalid
	* @throws {Error} If there is already a nested object with this name or, if a field, when there is already a field with this id
	*/
	Type.prototype.add = function add(object) {
		if (this.get(object.name)) throw Error("duplicate name '" + object.name + "' in " + this);
		if (object instanceof Field && object.extend === void 0) {
			if (this._fieldsById ? /* istanbul ignore next */ this._fieldsById[object.id] : this.fieldsById[object.id]) throw Error("duplicate id " + object.id + " in " + this);
			if (this.isReservedId(object.id)) throw Error("id " + object.id + " is reserved in " + this);
			if (this.isReservedName(object.name) || object.name.charAt(0) === "$") throw Error("name '" + object.name + "' is reserved in " + this);
			if (object.name === "__proto__") return this;
			if (object.parent) object.parent.remove(object);
			this.fields[object.name] = object;
			object.message = this;
			object.onAdd(this);
			return clearCache(this);
		}
		if (object instanceof OneOf) {
			if (object.name.charAt(0) === "$") throw Error("name '" + object.name + "' is reserved in " + this);
			if (object.name === "__proto__") return this;
			if (!this.oneofs) this.oneofs = {};
			this.oneofs[object.name] = object;
			object.onAdd(this);
			return clearCache(this);
		}
		return Namespace.prototype.add.call(this, object);
	};
	/**
	* Removes a nested object from this type.
	* @param {ReflectionObject} object Nested object to remove
	* @returns {Type} `this`
	* @throws {TypeError} If arguments are invalid
	* @throws {Error} If `object` is not a member of this type
	*/
	Type.prototype.remove = function remove(object) {
		if (object instanceof Field && object.extend === void 0) {
			/* istanbul ignore if */
			if (!util.remove(this.fields, object, object.name)) throw Error(object + " is not a member of " + this);
			object.parent = null;
			object.onRemove(this);
			return clearCache(this);
		}
		if (object instanceof OneOf) {
			/* istanbul ignore if */
			if (!util.remove(this.oneofs, object, object.name)) throw Error(object + " is not a member of " + this);
			object.parent = null;
			object.onRemove(this);
			return clearCache(this);
		}
		return Namespace.prototype.remove.call(this, object);
	};
	/**
	* Tests if the specified id is reserved.
	* @param {number} id Id to test
	* @returns {boolean} `true` if reserved, otherwise `false`
	*/
	Type.prototype.isReservedId = function isReservedId(id) {
		return Namespace.isReservedId(this.reserved, id);
	};
	/**
	* Tests if the specified name is reserved.
	* @param {string} name Name to test
	* @returns {boolean} `true` if reserved, otherwise `false`
	*/
	Type.prototype.isReservedName = function isReservedName(name) {
		return Namespace.isReservedName(this.reserved, name);
	};
	/**
	* Creates a new message of this type using the specified properties.
	* @param {Object.<string,*>} [properties] Properties to set
	* @returns {ReflectedMessage} Message instance
	*/
	Type.prototype.create = function create(properties) {
		return new this.ctor(properties);
	};
	/**
	* Sets up {@link Type#encode|encode}, {@link Type#decode|decode} and {@link Type#verify|verify}.
	* @returns {Type} `this`
	*/
	Type.prototype.setup = function setup() {
		var root = this.root;
		if (root && root._needsRecursiveFeatureResolution) {
			var edition = root._edition || this._edition;
			if (edition) root._resolveFeaturesRecursive(edition);
		}
		var fullName = this.fullName, types = [];
		for (var i = 0; i < this.fieldsArray.length; ++i) types.push(this._fieldsArray[i].resolve().resolvedType);
		this.encode = encoder(this)({
			Writer,
			types,
			util
		});
		this.decode = decoder(this)({
			Reader,
			types,
			util,
			C: this.ctor
		});
		this.verify = verifier(this)({
			types,
			util
		});
		this.fromObject = converter.fromObject(this)({
			types,
			util,
			C: this.ctor
		});
		this.toObject = converter.toObject(this)({
			types,
			util
		});
		var wrapper = wrappers[fullName];
		if (wrapper) {
			var wrapperThis = Object.create(this);
			wrapperThis._ctor = this.ctor;
			wrapperThis.fromObject = this.fromObject;
			this.fromObject = wrapper.fromObject.bind(wrapperThis);
			wrapperThis.toObject = this.toObject;
			this.toObject = wrapper.toObject.bind(wrapperThis);
		}
		return this;
	};
	/**
	* Encodes a message of this type. Does not implicitly {@link Type#verify|verify} messages.
	* @param {Message<{}>|Object.<string,*>} message Message instance or plain object
	* @param {Writer} [writer] Writer to encode to
	* @returns {Writer} writer
	*/
	Type.prototype.encode = function encode_setup(message, writer) {
		return this.setup().encode.apply(this, arguments);
	};
	/**
	* Encodes a message of this type preceeded by its byte length as a varint. Does not implicitly {@link Type#verify|verify} messages.
	* @param {Message<{}>|Object.<string,*>} message Message instance or plain object
	* @param {Writer} [writer] Writer to encode to
	* @returns {Writer} writer
	*/
	Type.prototype.encodeDelimited = function encodeDelimited(message, writer) {
		return this.encode(message, (writer || Writer.create()).fork()).ldelim();
	};
	/**
	* Decodes a message of this type.
	* @param {Reader|Uint8Array} reader Reader or buffer to decode from
	* @param {number} [length] Length of the message, if known beforehand
	* @returns {ReflectedMessage} Decoded message
	* @throws {Error} If the payload is not a reader or valid buffer
	* @throws {util.ProtocolError<{}>} If required fields are missing
	*/
	Type.prototype.decode = function decode_setup(reader, length) {
		return this.setup().decode.apply(this, arguments);
	};
	/**
	* Decodes a message of this type preceeded by its byte length as a varint.
	* @param {Reader|Uint8Array} reader Reader or buffer to decode from
	* @returns {ReflectedMessage} Decoded message
	* @throws {Error} If the payload is not a reader or valid buffer
	* @throws {util.ProtocolError} If required fields are missing
	*/
	Type.prototype.decodeDelimited = function decodeDelimited(reader) {
		if (!(reader instanceof Reader)) reader = Reader.create(reader);
		return this.decode(reader, reader.uint32());
	};
	/**
	* Verifies that field values are valid and that required fields are present.
	* @param {Object.<string,*>} message Plain object to verify
	* @returns {null|string} `null` if valid, otherwise the reason why it is not
	*/
	Type.prototype.verify = function verify_setup(message) {
		return this.setup().verify.apply(this, arguments);
	};
	/**
	* Creates a new message of this type from a plain object. Also converts values to their respective internal types.
	* @param {Object.<string,*>} object Plain object to convert
	* @returns {ReflectedMessage} Message instance
	*/
	Type.prototype.fromObject = function fromObject(object) {
		return this.setup().fromObject.apply(this, arguments);
	};
	/**
	* Conversion options as used by {@link Type#toObject} and {@link Message.toObject}.
	* @interface IConversionOptions
	* @property {Function} [longs] Long conversion type.
	* Valid values are `BigInt`, `String` and `Number` (the global types).
	* Defaults to copy the present value, which is a possibly unsafe number without and a {@link Long} with a long library.
	* @property {Function} [enums] Enum value conversion type.
	* Only valid value is `String` (the global type).
	* Defaults to copy the present value, which is the numeric id.
	* @property {Function} [bytes] Bytes value conversion type.
	* Valid values are `Array` and (a base64 encoded) `String` (the global types).
	* Defaults to copy the present value, which usually is a Buffer under node and an Uint8Array in the browser.
	* @property {boolean} [defaults=false] Also sets default values on the resulting object
	* @property {boolean} [arrays=false] Sets empty arrays for missing repeated fields even if `defaults=false`
	* @property {boolean} [objects=false] Sets empty objects for missing map fields even if `defaults=false`
	* @property {boolean} [oneofs=false] Includes virtual oneof properties set to the present field's name, if any
	* @property {boolean} [json=false] Performs additional JSON compatibility conversions, i.e. NaN and Infinity to strings
	*/
	/**
	* Creates a plain object from a message of this type. Also converts values to other types if specified.
	* @param {Message<{}>} message Message instance
	* @param {IConversionOptions} [options] Conversion options
	* @returns {Object.<string,*>} Plain object
	*/
	Type.prototype.toObject = function toObject(message, options) {
		return this.setup().toObject.apply(this, arguments);
	};
	/**
	* Gets the type url for this type.
	* @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
	* @returns {string} The type url
	*/
	Type.prototype.getTypeUrl = function getTypeUrl(prefix) {
		if (prefix === void 0) prefix = "type.googleapis.com";
		var fullName = this.fullName;
		return prefix + "/" + (fullName.charAt(0) === "." ? fullName.substring(1) : fullName);
	};
	/**
	* Decorator function as returned by {@link Type.d} (TypeScript).
	* @typedef TypeDecorator
	* @type {function}
	* @param {Constructor<T>} target Target constructor
	* @returns {undefined}
	* @template T extends Message<T>
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	/**
	* Type decorator (TypeScript).
	* @param {string} [typeName] Type name, defaults to the constructor's name
	* @returns {TypeDecorator<T>} Decorator function
	* @template T extends Message<T>
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	Type.d = function decorateType(typeName) {
		return function typeDecorator(target) {
			util.decorateType(target, typeName);
		};
	};
}));
//#endregion
//#region node_modules/protobufjs/src/root.js
var require_root = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Root;
	var Namespace = require_namespace();
	Root.prototype = Object.create(Namespace.prototype, { constructor: {
		value: Root,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	Root.className = "Root";
	var Field = require_field();
	var Enum = require_enum();
	var OneOf = require_oneof();
	var util = require_util();
	var Type;
	var parse;
	var common;
	/**
	* Constructs a new root namespace instance.
	* @classdesc Root namespace wrapping all types, enums, services, sub-namespaces etc. that belong together.
	* @extends NamespaceBase
	* @constructor
	* @param {Object.<string,*>} [options] Top level options
	*/
	function Root(options) {
		Namespace.call(this, "", options);
		/**
		* Deferred extension fields.
		* @type {Field[]}
		*/
		this.deferred = [];
		/**
		* Resolved file names of loaded files.
		* @type {string[]}
		*/
		this.files = [];
		/**
		* Edition, defaults to proto2 if unspecified.
		* @type {string}
		* @private
		*/
		this._edition = "proto2";
		/**
		* Global lookup cache of fully qualified names.
		* @type {Object.<string,ReflectionObject>}
		* @private
		*/
		this._fullyQualifiedObjects = {};
	}
	/**
	* Loads a namespace descriptor into a root namespace.
	* @param {INamespace} json Namespace descriptor
	* @param {Root} [root] Root namespace, defaults to create a new one if omitted
	* @param {number} [depth] Current nesting depth, defaults to `0`
	* @returns {Root} Root namespace
	*/
	Root.fromJSON = function fromJSON(json, root, depth) {
		if (depth === void 0) depth = 0;
		if (depth > util.recursionLimit) throw Error("max depth exceeded");
		if (!root) root = new Root();
		if (json.options) root.setOptions(json.options);
		return root.addJSON(json.nested, depth).resolveAll();
	};
	/**
	* Resolves the path of an imported file, relative to the importing origin.
	* This method exists so you can override it with your own logic in case your imports are scattered over multiple directories.
	* @function
	* @param {string} origin The file name of the importing file
	* @param {string} target The file name being imported
	* @returns {string|null} Resolved path to `target` or `null` to skip the file
	*/
	Root.prototype.resolvePath = util.path.resolve;
	/**
	* Fetch content from file path or url
	* This method exists so you can override it with your own logic.
	* @function
	* @param {string} path File path or url
	* @param {FetchCallback} callback Callback function
	* @returns {undefined}
	*/
	Root.prototype.fetch = util.fetch;
	/* istanbul ignore next */
	function SYNC() {}
	/**
	* Loads one or multiple .proto or preprocessed .json files into this root namespace and calls the callback.
	* @param {string|string[]} filename Names of one or multiple files to load
	* @param {IParseOptions} options Parse options
	* @param {LoadCallback} callback Callback function
	* @returns {undefined}
	*/
	Root.prototype.load = function load(filename, options, callback) {
		if (typeof options === "function") {
			callback = options;
			options = void 0;
		}
		var self = this;
		if (!callback) return util.asPromise(load, self, filename, options);
		var sync = callback === SYNC;
		function finish(err, root) {
			/* istanbul ignore if */
			if (!callback) return;
			if (sync) throw err;
			if (root) root.resolveAll();
			var cb = callback;
			callback = null;
			cb(err, root);
		}
		function getBundledFileName(filename) {
			var idx = filename.lastIndexOf("google/protobuf/");
			if (idx > -1) {
				var altname = filename.substring(idx);
				if (Object.prototype.hasOwnProperty.call(common, altname)) return altname;
			}
			if (Object.prototype.hasOwnProperty.call(common, filename)) return filename;
			return null;
		}
		function process(filename, source, depth) {
			if (depth === void 0) depth = 0;
			try {
				if (depth > util.recursionLimit) throw Error("max depth exceeded");
				if (util.isString(source) && source.charAt(0) === "{") source = JSON.parse(source);
				if (!util.isString(source)) self.setOptions(source.options).addJSON(source.nested);
				else {
					parse.filename = filename;
					var parsed = parse(source, self, options), resolved, i = 0;
					if (parsed.imports) {
						for (; i < parsed.imports.length; ++i) if (resolved = getBundledFileName(parsed.imports[i]) || self.resolvePath(filename, parsed.imports[i])) fetch(resolved, false, depth + 1);
					}
					if (parsed.weakImports) {
						for (i = 0; i < parsed.weakImports.length; ++i) if (resolved = getBundledFileName(parsed.weakImports[i]) || self.resolvePath(filename, parsed.weakImports[i])) fetch(resolved, true, depth + 1);
					}
				}
			} catch (err) {
				finish(err);
			}
			if (!sync && !queued) finish(null, self);
		}
		function fetch(filename, weak, depth) {
			if (depth === void 0) depth = 0;
			filename = getBundledFileName(filename) || filename;
			if (self.files.indexOf(filename) > -1) return;
			self.files.push(filename);
			if (Object.prototype.hasOwnProperty.call(common, filename)) {
				if (sync) process(filename, common[filename], depth);
				else {
					++queued;
					setTimeout(function() {
						--queued;
						process(filename, common[filename], depth);
					});
				}
				return;
			}
			if (sync) {
				var source;
				try {
					source = util.fs.readFileSync(filename).toString("utf8");
				} catch (err) {
					if (!weak) finish(err);
					return;
				}
				process(filename, source, depth);
			} else {
				++queued;
				self.fetch(filename, function(err, source) {
					--queued;
					/* istanbul ignore if */
					if (!callback) return;
					if (err) {
						/* istanbul ignore else */
						if (!weak) finish(err);
						else if (!queued) finish(null, self);
						return;
					}
					process(filename, source, depth);
				});
			}
		}
		var queued = 0;
		if (util.isString(filename)) filename = [filename];
		for (var i = 0, resolved; i < filename.length; ++i) if (resolved = self.resolvePath("", filename[i])) fetch(resolved);
		if (sync) {
			self.resolveAll();
			return self;
		}
		if (!queued) finish(null, self);
		return self;
	};
	/**
	* Loads one or multiple .proto or preprocessed .json files into this root namespace and calls the callback.
	* @function Root#load
	* @param {string|string[]} filename Names of one or multiple files to load
	* @param {LoadCallback} callback Callback function
	* @returns {undefined}
	* @variation 2
	*/
	/**
	* Loads one or multiple .proto or preprocessed .json files into this root namespace and returns a promise.
	* @function Root#load
	* @param {string|string[]} filename Names of one or multiple files to load
	* @param {IParseOptions} [options] Parse options. Defaults to {@link parse.defaults} when omitted.
	* @returns {Promise<Root>} Promise
	* @variation 3
	*/
	/**
	* Synchronously loads one or multiple .proto or preprocessed .json files into this root namespace (node only).
	* @function Root#loadSync
	* @param {string|string[]} filename Names of one or multiple files to load
	* @param {IParseOptions} [options] Parse options. Defaults to {@link parse.defaults} when omitted.
	* @returns {Root} Root namespace
	* @throws {Error} If synchronous fetching is not supported (i.e. in browsers) or if a file's syntax is invalid
	*/
	Root.prototype.loadSync = function loadSync(filename, options) {
		if (!util.isNode) throw Error("not supported");
		return this.load(filename, options, SYNC);
	};
	/**
	* @override
	*/
	Root.prototype.resolveAll = function resolveAll() {
		if (!this._needsRecursiveResolve) return this;
		if (this.deferred.length) throw Error("unresolvable extensions: " + this.deferred.map(function(field) {
			return "'extend " + field.extend + "' in " + field.parent.fullName;
		}).join(", "));
		return Namespace.prototype.resolveAll.call(this);
	};
	var exposeRe = /^[A-Z]/;
	/**
	* Handles a deferred declaring extension field by creating a sister field to represent it within its extended type.
	* @param {Root} root Root instance
	* @param {Field} field Declaring extension field witin the declaring type
	* @returns {boolean} `true` if successfully added to the extended type, `false` otherwise
	* @inner
	* @ignore
	*/
	function tryHandleExtension(root, field) {
		var extendedType = field.parent.lookup(field.extend);
		if (extendedType) {
			var sisterField = new Field(field.fullName, field.id, field.type, field.rule, void 0, field.options);
			if (extendedType.get(sisterField.name)) return true;
			sisterField.declaringField = field;
			field.extensionField = sisterField;
			extendedType.add(sisterField);
			return true;
		}
		return false;
	}
	/**
	* Called when any object is added to this root or its sub-namespaces.
	* @param {ReflectionObject} object Object added
	* @returns {undefined}
	* @private
	*/
	Root.prototype._handleAdd = function _handleAdd(object) {
		if (object instanceof Field) {
			if (object.extend !== void 0 && !object.extensionField) {
				if (!tryHandleExtension(this, object)) this.deferred.push(object);
			}
		} else if (object instanceof Enum) {
			if (exposeRe.test(object.name)) object.parent[object.name] = object.values;
		} else if (!(object instanceof OneOf)) {
			if (object instanceof Type) for (var i = 0; i < this.deferred.length;) if (tryHandleExtension(this, this.deferred[i])) this.deferred.splice(i, 1);
			else ++i;
			for (var j = 0; j < object.nestedArray.length; ++j) this._handleAdd(object._nestedArray[j]);
			if (exposeRe.test(object.name)) object.parent[object.name] = object;
		}
		if (object instanceof Type || object instanceof Enum || object instanceof Field) this._fullyQualifiedObjects[object.fullName] = object;
	};
	/**
	* Called when any object is removed from this root or its sub-namespaces.
	* @param {ReflectionObject} object Object removed
	* @returns {undefined}
	* @private
	*/
	Root.prototype._handleRemove = function _handleRemove(object) {
		if (object instanceof Field) {
			if (object.extend !== void 0) {
				if (object.extensionField) {
					object.extensionField.parent.remove(object.extensionField);
					object.extensionField = null;
				} else {
					var index = this.deferred.indexOf(object);
					/* istanbul ignore else */
					if (index > -1) this.deferred.splice(index, 1);
				}
			}
		} else if (object instanceof Enum) {
			if (exposeRe.test(object.name)) delete object.parent[object.name];
		} else if (object instanceof Namespace) {
			for (var i = 0; i < object.nestedArray.length; ++i) this._handleRemove(object._nestedArray[i]);
			if (exposeRe.test(object.name)) delete object.parent[object.name];
		}
		delete this._fullyQualifiedObjects[object.fullName];
	};
	Root._configure = function(Type_, parse_, common_) {
		Type = Type_;
		parse = parse_;
		common = common_;
	};
}));
//#endregion
//#region node_modules/protobufjs/src/util.js
var require_util = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Various utility functions.
	* @namespace
	*/
	var util = module.exports = require_minimal();
	var roots = require_roots();
	var Type;
	var Enum;
	util.codegen = require_codegen();
	util.fetch = require_fetch();
	util.path = require_path();
	util.patterns = require_patterns();
	var reservedRe = util.patterns.reservedRe;
	/**
	* Node's fs module if available.
	* @type {Object.<string,*>}
	*/
	util.fs = require_fs();
	/**
	* Converts an object's values to an array.
	* @param {Object.<string,*>} object Object to convert
	* @returns {Array.<*>} Converted array
	*/
	util.toArray = function toArray(object) {
		if (object) {
			var keys = Object.keys(object), array = new Array(keys.length), index = 0;
			while (index < keys.length) array[index] = object[keys[index++]];
			return array;
		}
		return [];
	};
	/**
	* Converts an array of keys immediately followed by their respective value to an object, omitting undefined values.
	* @param {Array.<*>} array Array to convert
	* @returns {Object.<string,*>} Converted object
	*/
	util.toObject = function toObject(array) {
		var object = {}, index = 0;
		while (index < array.length) {
			var key = array[index++], val = array[index++];
			if (val !== void 0) object[key] = val;
		}
		return object;
	};
	/**
	* Removes the first matching value from an object.
	* @param {Object.<string,*>|undefined} object Object to remove from
	* @param {*} value Value to remove
	* @param {string} [key] Optional key for fast path removal
	* @returns {boolean} `true` if removed, otherwise `false`
	*/
	util.remove = function remove(object, value, key) {
		if (!object) return false;
		if (key !== void 0 && Object.prototype.hasOwnProperty.call(object, key) && object[key] === value) {
			delete object[key];
			return true;
		}
		for (var names = Object.keys(object), i = 0; i < names.length; ++i) if (object[names[i]] === value) {
			delete object[names[i]];
			return true;
		}
		return false;
	};
	/**
	* Tests whether the specified name is a reserved word in JS.
	* @param {string} name Name to test
	* @returns {boolean} `true` if reserved, otherwise `false`
	*/
	util.isReserved = function isReserved(name) {
		return reservedRe.test(name);
	};
	/**
	* Returns a safe property accessor for the specified property name.
	* @param {string} prop Property name
	* @returns {string} Safe accessor
	*/
	util.safeProp = function safeProp(prop) {
		if (!/^[$\w_]+$/.test(prop) || reservedRe.test(prop)) return "[" + JSON.stringify(prop) + "]";
		return "." + prop;
	};
	/**
	* Converts the first character of a string to upper case.
	* @param {string} str String to convert
	* @returns {string} Converted string
	*/
	util.ucFirst = function ucFirst(str) {
		return str.charAt(0).toUpperCase() + str.substring(1);
	};
	var camelCaseRe = /_([a-z])/g;
	/**
	* Converts a string to camel case.
	* @param {string} str String to convert
	* @returns {string} Converted string
	* @deprecated Use {@link util.jsonName} for protobuf field JSON names.
	*/
	util.camelCase = function camelCase(str) {
		return str.substring(0, 1) + str.substring(1).replace(camelCaseRe, function($0, $1) {
			return $1.toUpperCase();
		});
	};
	/**
	* Converts a proto field name to its protoc-compatible JSON name.
	* @param {string} str Proto field name
	* @returns {string} JSON name
	*/
	util.jsonName = function jsonName(str) {
		var result = "", upperNext = false, i = 0;
		for (; i < str.length; ++i) {
			var ch = str.charAt(i);
			if (ch === "_") upperNext = true;
			else if (upperNext) {
				result += ch.toUpperCase();
				upperNext = false;
			} else result += ch;
		}
		return result;
	};
	/**
	* Compares reflected fields by id.
	* @param {Field} a First field
	* @param {Field} b Second field
	* @returns {number} Comparison value
	*/
	util.compareFieldsById = function compareFieldsById(a, b) {
		return a.id - b.id;
	};
	/**
	* Decorator helper for types (TypeScript).
	* @param {Constructor<T>} ctor Constructor function
	* @param {string} [typeName] Type name, defaults to the constructor's name
	* @returns {Type} Reflected type
	* @template T extends Message<T>
	* @property {Root} root Decorators root
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	util.decorateType = function decorateType(ctor, typeName) {
		/* istanbul ignore if */
		if (ctor.$type) {
			if (typeName && ctor.$type.name !== typeName) {
				util.decorateRoot.remove(ctor.$type);
				ctor.$type.name = typeName;
				util.decorateRoot.add(ctor.$type);
			}
			return ctor.$type;
		}
		/* istanbul ignore next */
		if (!Type) Type = require_type();
		var type = new Type(typeName || ctor.name);
		util.decorateRoot.add(type);
		type.ctor = ctor;
		Object.defineProperty(ctor, "$type", {
			value: type,
			enumerable: false
		});
		Object.defineProperty(ctor.prototype, "$type", {
			value: type,
			enumerable: false
		});
		return type;
	};
	var decorateEnumIndex = 0;
	/**
	* Decorator helper for enums (TypeScript).
	* @param {Object} object Enum object
	* @returns {Enum} Reflected enum
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	util.decorateEnum = function decorateEnum(object) {
		/* istanbul ignore if */
		if (object.$type) return object.$type;
		/* istanbul ignore next */
		if (!Enum) Enum = require_enum();
		var enm = new Enum("Enum" + decorateEnumIndex++, object);
		util.decorateRoot.add(enm);
		Object.defineProperty(object, "$type", {
			value: enm,
			enumerable: false
		});
		return enm;
	};
	/**
	* Sets the value of a property by property path. If a value already exists, it is turned to an array
	* @param {Object.<string,*>} dst Destination object
	* @param {string} path dot '.' delimited path of the property to set
	* @param {Object} value the value to set
	* @param {boolean|undefined} [ifNotSet] Sets the option only if it isn't currently set
	* @returns {Object.<string,*>} Destination object
	*/
	util.setProperty = function setProperty(dst, path, value, ifNotSet) {
		function setProp(dst, path, value) {
			var part = path.shift();
			if (util.isUnsafeProperty(part)) return dst;
			if (path.length > 0) dst[part] = setProp(dst[part] || {}, path, value);
			else {
				var prevValue = dst[part];
				if (prevValue && ifNotSet) return dst;
				if (prevValue) value = [].concat(prevValue).concat(value);
				dst[part] = value;
			}
			return dst;
		}
		if (typeof dst !== "object") throw TypeError("dst must be an object");
		if (!path) throw TypeError("path must be specified");
		path = path.split(".");
		if (path.length > util.recursionLimit) throw Error("max depth exceeded");
		return setProp(dst, path, value);
	};
	/**
	* Decorator root (TypeScript).
	* @name util.decorateRoot
	* @type {Root}
	* @readonly
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	Object.defineProperty(util, "decorateRoot", { get: function() {
		return roots["decorated"] || (roots["decorated"] = new (require_root())());
	} });
}));
//#endregion
//#region node_modules/protobufjs/src/types.js
var require_types = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Common type constants.
	* @namespace
	*/
	var types = exports;
	var util = require_util();
	var s = [
		"double",
		"float",
		"int32",
		"uint32",
		"sint32",
		"fixed32",
		"sfixed32",
		"int64",
		"uint64",
		"sint64",
		"fixed64",
		"sfixed64",
		"bool",
		"string",
		"bytes"
	];
	function bake(values, offset) {
		var i = 0, o = Object.create(null);
		offset |= 0;
		while (i < values.length) o[s[i + offset]] = values[i++];
		return o;
	}
	/**
	* Basic type wire types.
	* @type {Object.<string,number>}
	* @const
	* @property {number} double=1 Fixed64 wire type
	* @property {number} float=5 Fixed32 wire type
	* @property {number} int32=0 Varint wire type
	* @property {number} uint32=0 Varint wire type
	* @property {number} sint32=0 Varint wire type
	* @property {number} fixed32=5 Fixed32 wire type
	* @property {number} sfixed32=5 Fixed32 wire type
	* @property {number} int64=0 Varint wire type
	* @property {number} uint64=0 Varint wire type
	* @property {number} sint64=0 Varint wire type
	* @property {number} fixed64=1 Fixed64 wire type
	* @property {number} sfixed64=1 Fixed64 wire type
	* @property {number} bool=0 Varint wire type
	* @property {number} string=2 Ldelim wire type
	* @property {number} bytes=2 Ldelim wire type
	*/
	types.basic = bake([
		1,
		5,
		0,
		0,
		0,
		5,
		5,
		0,
		0,
		0,
		1,
		1,
		0,
		2,
		2
	]);
	/**
	* Basic type defaults.
	* @type {Object.<string,*>}
	* @const
	* @property {number} double=0 Double default
	* @property {number} float=0 Float default
	* @property {number} int32=0 Int32 default
	* @property {number} uint32=0 Uint32 default
	* @property {number} sint32=0 Sint32 default
	* @property {number} fixed32=0 Fixed32 default
	* @property {number} sfixed32=0 Sfixed32 default
	* @property {number} int64=0 Int64 default
	* @property {number} uint64=0 Uint64 default
	* @property {number} sint64=0 Sint32 default
	* @property {number} fixed64=0 Fixed64 default
	* @property {number} sfixed64=0 Sfixed64 default
	* @property {boolean} bool=false Bool default
	* @property {string} string="" String default
	* @property {Array.<number>} bytes=Array(0) Bytes default
	* @property {null} message=null Message default
	*/
	types.defaults = bake([
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		false,
		"",
		util.emptyArray,
		null
	]);
	/**
	* Basic long type wire types.
	* @type {Object.<string,number>}
	* @const
	* @property {number} int64=0 Varint wire type
	* @property {number} uint64=0 Varint wire type
	* @property {number} sint64=0 Varint wire type
	* @property {number} fixed64=1 Fixed64 wire type
	* @property {number} sfixed64=1 Fixed64 wire type
	*/
	types.long = bake([
		0,
		0,
		0,
		1,
		1
	], 7);
	/**
	* Allowed types for map keys with their associated wire type.
	* @type {Object.<string,number>}
	* @const
	* @property {number} int32=0 Varint wire type
	* @property {number} uint32=0 Varint wire type
	* @property {number} sint32=0 Varint wire type
	* @property {number} fixed32=5 Fixed32 wire type
	* @property {number} sfixed32=5 Fixed32 wire type
	* @property {number} int64=0 Varint wire type
	* @property {number} uint64=0 Varint wire type
	* @property {number} sint64=0 Varint wire type
	* @property {number} fixed64=1 Fixed64 wire type
	* @property {number} sfixed64=1 Fixed64 wire type
	* @property {number} bool=0 Varint wire type
	* @property {number} string=2 Ldelim wire type
	*/
	types.mapKey = bake([
		0,
		0,
		0,
		5,
		5,
		0,
		0,
		0,
		1,
		1,
		0,
		2
	], 2);
	/**
	* Allowed types for packed repeated fields with their associated wire type.
	* @type {Object.<string,number>}
	* @const
	* @property {number} double=1 Fixed64 wire type
	* @property {number} float=5 Fixed32 wire type
	* @property {number} int32=0 Varint wire type
	* @property {number} uint32=0 Varint wire type
	* @property {number} sint32=0 Varint wire type
	* @property {number} fixed32=5 Fixed32 wire type
	* @property {number} sfixed32=5 Fixed32 wire type
	* @property {number} int64=0 Varint wire type
	* @property {number} uint64=0 Varint wire type
	* @property {number} sint64=0 Varint wire type
	* @property {number} fixed64=1 Fixed64 wire type
	* @property {number} sfixed64=1 Fixed64 wire type
	* @property {number} bool=0 Varint wire type
	*/
	types.packed = bake([
		1,
		5,
		0,
		0,
		0,
		5,
		5,
		0,
		0,
		0,
		1,
		1,
		0
	]);
}));
//#endregion
//#region node_modules/protobufjs/src/field.js
var require_field = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Field;
	var ReflectionObject = require_object();
	Field.prototype = Object.create(ReflectionObject.prototype, { constructor: {
		value: Field,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	Field.className = "Field";
	var Enum = require_enum();
	var types = require_types();
	var util = require_util();
	var Type;
	var ruleRe = /^(?:required|optional|repeated)$/;
	/**
	* Constructs a new message field instance. Note that {@link MapField|map fields} have their own class.
	* @name Field
	* @classdesc Reflected message field.
	* @extends FieldBase
	* @constructor
	* @param {string} name Unique name within its namespace
	* @param {number} id Unique id within its namespace
	* @param {string} type Value type
	* @param {string|Object.<string,*>} [rule="optional"] Field rule
	* @param {string|Object.<string,*>} [extend] Extended type if different from parent
	* @param {Object.<string,*>} [options] Declared options
	*/
	/**
	* Constructs a field from a field descriptor.
	* @param {string} name Field name
	* @param {IField} json Field descriptor
	* @returns {Field} Created field
	* @throws {TypeError} If arguments are invalid
	*/
	Field.fromJSON = function fromJSON(name, json) {
		var field = new Field(name, json.id, json.type, json.rule, json.extend, json.options, json.comment);
		if (json.edition) field._edition = json.edition;
		if (json.protoName) field.protoName = json.protoName;
		if (json.jsonName !== void 0) field.jsonName = json.jsonName;
		else if (json.options && json.options.json_name !== void 0) field.jsonName = json.options.json_name;
		field._defaultEdition = "proto3";
		return field;
	};
	/**
	* Not an actual constructor. Use {@link Field} instead.
	* @classdesc Base class of all reflected message fields. This is not an actual class but here for the sake of having consistent type definitions.
	* @exports FieldBase
	* @extends ReflectionObject
	* @constructor
	* @param {string} name Unique name within its namespace
	* @param {number} id Unique id within its namespace
	* @param {string} type Value type
	* @param {string|Object.<string,*>} [rule="optional"] Field rule
	* @param {string|Object.<string,*>} [extend] Extended type if different from parent
	* @param {Object.<string,*>} [options] Declared options
	* @param {string} [comment] Comment associated with this field
	*/
	function Field(name, id, type, rule, extend, options, comment) {
		if (util.isObject(rule)) {
			comment = extend;
			options = rule;
			rule = extend = void 0;
		} else if (util.isObject(extend)) {
			comment = options;
			options = extend;
			extend = void 0;
		}
		ReflectionObject.call(this, name, options);
		if (!util.isInteger(id) || id < 0) throw TypeError("id must be a non-negative integer");
		if (!util.isString(type)) throw TypeError("type must be a string");
		if (rule !== void 0 && !ruleRe.test(rule = rule.toString().toLowerCase())) throw TypeError("rule must be a string rule");
		if (extend !== void 0 && !util.isString(extend)) throw TypeError("extend must be a string");
		/**
		* Field rule, if any.
		* @type {string|undefined}
		*/
		this.rule = rule && rule !== "optional" ? rule : void 0;
		/**
		* Field type.
		* @type {string}
		*/
		this.type = type;
		/**
		* Unique field id.
		* @type {number}
		*/
		this.id = id;
		/**
		* Extended type if different from parent.
		* @type {string|undefined}
		*/
		this.extend = extend || void 0;
		/**
		* Whether this field is repeated.
		* @type {boolean}
		*/
		this.repeated = rule === "repeated";
		/**
		* Whether this field is a map or not.
		* @type {boolean}
		*/
		this.map = false;
		/**
		* Message this field belongs to.
		* @type {Type|null}
		*/
		this.message = null;
		/**
		* OneOf this field belongs to, if any,
		* @type {OneOf|null}
		*/
		this.partOf = null;
		/**
		* The field type's default value.
		* @type {*}
		*/
		this.typeDefault = null;
		/**
		* The field's default value on prototypes.
		* @type {*}
		*/
		this.defaultValue = null;
		/**
		* Whether this field's value should be treated as a long.
		* @type {boolean}
		*/
		this.long = util.Long ? types.long[type] !== void 0 : /* istanbul ignore next */ false;
		/**
		* Whether this field's value is a buffer.
		* @type {boolean}
		*/
		this.bytes = type === "bytes";
		/**
		* Resolved type if not a basic type.
		* @type {Type|Enum|null}
		*/
		this.resolvedType = null;
		/**
		* Sister-field within the extended type if a declaring extension field.
		* @type {Field|null}
		*/
		this.extensionField = null;
		/**
		* Sister-field within the declaring namespace if an extended field.
		* @type {Field|null}
		*/
		this.declaringField = null;
		/**
		* Comment for this field.
		* @type {string|null}
		*/
		this.comment = comment;
		/**
		* Field name as declared in the .proto source, if different from `name`.
		* @type {string|undefined}
		*/
		this.protoName = void 0;
		/**
		* JSON name, if different from the derived default.
		* @type {string|undefined}
		*/
		this.jsonName = void 0;
	}
	/**
	* Determines whether this field is required.
	* @name Field#required
	* @type {boolean}
	* @readonly
	*/
	Object.defineProperty(Field.prototype, "required", { get: function() {
		return this._features.field_presence === "LEGACY_REQUIRED";
	} });
	/**
	* Determines whether this field is not required.
	* @name Field#optional
	* @type {boolean}
	* @readonly
	*/
	Object.defineProperty(Field.prototype, "optional", { get: function() {
		return !this.required;
	} });
	/**
	* Determines whether this field uses tag-delimited encoding.  In proto2 this
	* corresponded to group syntax.
	* @name Field#delimited
	* @type {boolean}
	* @readonly
	*/
	Object.defineProperty(Field.prototype, "delimited", { get: function() {
		return this.resolvedType instanceof Type && this._features.message_encoding === "DELIMITED";
	} });
	/**
	* Determines whether this field is packed. Only relevant when repeated.
	* @name Field#packed
	* @type {boolean}
	* @readonly
	*/
	Object.defineProperty(Field.prototype, "packed", { get: function() {
		return this._features.repeated_field_encoding === "PACKED";
	} });
	/**
	* Determines whether this field tracks presence.
	* @name Field#hasPresence
	* @type {boolean}
	* @readonly
	*/
	Object.defineProperty(Field.prototype, "hasPresence", { get: function() {
		if (this.repeated || this.map) return false;
		return this.partOf || this.declaringField || this.extensionField || this._features.field_presence !== "IMPLICIT";
	} });
	/**
	* The field name as declared in the .proto source (snake_case). Populated on resolve,
	* falling back to `name`. Mirrors `FieldDescriptorProto.name`.
	* @name Field#protoName
	* @type {string}
	* @readonly
	*/
	/**
	* The JSON name of this field (lowerCamelCase per protoc's `ToJsonName`, or an
	* explicit `[json_name]`). Populated on resolve. This is the key used on ProtoJSON output.
	* @name Field#jsonName
	* @type {string}
	* @readonly
	*/
	/**
	* @override
	*/
	Field.prototype.setOption = function setOption(name, value, ifNotSet) {
		return ReflectionObject.prototype.setOption.call(this, name, value, ifNotSet);
	};
	/**
	* Field descriptor.
	* @interface IField
	* @property {string} [edition] Edition
	* @property {string} [rule="optional"] Field rule
	* @property {string} type Field type
	* @property {number} id Field id
	* @property {Object.<string,*>} [options] Field options
	* @property {string|null} [comment] Field comment
	*/
	/**
	* Extension field descriptor.
	* @interface IExtensionField
	* @extends IField
	* @property {string} extend Extended type
	*/
	/**
	* Converts this field to a field descriptor.
	* @param {IToJSONOptions} [toJSONOptions] JSON conversion options
	* @returns {IField} Field descriptor
	*/
	Field.prototype.toJSON = function toJSON(toJSONOptions) {
		var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
		return util.toObject([
			"edition",
			this._editionToJSON(),
			"rule",
			this.rule !== "optional" && this.rule || void 0,
			"type",
			this.type,
			"id",
			this.id,
			"extend",
			this.extend,
			"protoName",
			this.protoName !== this.name ? this.protoName : void 0,
			"jsonName",
			this.jsonName !== util.jsonName(this.protoName || this.name) ? this.jsonName : void 0,
			"options",
			this.options,
			"comment",
			keepComments ? this.comment : void 0
		]);
	};
	/**
	* Resolves this field's type references.
	* @returns {Field} `this`
	* @throws {Error} If any reference cannot be resolved
	*/
	Field.prototype.resolve = function resolve() {
		if (this.resolved) return this;
		if ((this.typeDefault = types.defaults[this.type]) === void 0) {
			this.resolvedType = (this.declaringField ? this.declaringField.parent : this.parent).lookupTypeOrEnum(this.type);
			if (this.resolvedType instanceof Type) this.typeDefault = null;
			else this.typeDefault = this.resolvedType.values[Object.keys(this.resolvedType.values)[0]];
		} else if (this.options && this.options.proto3_optional) this.typeDefault = null;
		if (this.options && this.options["default"] != null) {
			this.typeDefault = this.options["default"];
			if (this.resolvedType instanceof Enum && typeof this.typeDefault === "string") this.typeDefault = this.resolvedType.values[this.typeDefault];
		}
		if (this.options) {
			if (this.options.packed !== void 0 && this.resolvedType && !(this.resolvedType instanceof Enum)) delete this.options.packed;
			if (!Object.keys(this.options).length) this.options = void 0;
		}
		if (this.long) {
			var unsigned = this.type === "uint64" || this.type === "fixed64";
			this.typeDefault = typeof this.typeDefault === "string" ? util.Long.fromString(this.typeDefault, unsigned) : util.Long.fromNumber(this.typeDefault, unsigned);
			/* istanbul ignore else */
			if (Object.freeze) Object.freeze(this.typeDefault);
		} else if (types.long[this.type] !== void 0 && typeof this.typeDefault === "string") this.typeDefault = parseInt(this.typeDefault, 10);
		else if (this.bytes && typeof this.typeDefault === "string") {
			var buf;
			if (util.base64.test(this.typeDefault)) util.base64.decode(this.typeDefault, buf = util.newBuffer(util.base64.length(this.typeDefault)), 0);
			else util.utf8.write(this.typeDefault, buf = util.newBuffer(util.utf8.length(this.typeDefault)), 0);
			this.typeDefault = buf;
		}
		if (this.map) this.defaultValue = util.emptyObject;
		else if (this.repeated) this.defaultValue = util.emptyArray;
		else this.defaultValue = this.typeDefault;
		if (this.parent instanceof Type && this.parent._ctor) this.parent._ctor.prototype[this.name] = this.defaultValue;
		if (this.protoName === void 0) this.protoName = this.name;
		if (this.jsonName === void 0) this.jsonName = util.jsonName(this.protoName);
		return ReflectionObject.prototype.resolve.call(this);
	};
	/**
	* Infers field features from legacy syntax that may have been specified differently.
	* in older editions.
	* @param {string|undefined} edition The edition this proto is on, or undefined if pre-editions
	* @returns {object} The feature values to override
	*/
	Field.prototype._inferLegacyProtoFeatures = function _inferLegacyProtoFeatures(edition) {
		if (edition !== "proto2" && edition !== "proto3") return {};
		var features = {};
		if (this.rule === "required") features.field_presence = "LEGACY_REQUIRED";
		if (this.parent && types.defaults[this.type] === void 0) {
			var type = this.parent.get(this.type.split(".").pop());
			if (type && type instanceof Type && type.group) features.message_encoding = "DELIMITED";
		}
		if (this.getOption("packed") === true) features.repeated_field_encoding = "PACKED";
		else if (this.getOption("packed") === false) features.repeated_field_encoding = "EXPANDED";
		return features;
	};
	/**
	* @override
	*/
	Field.prototype._resolveFeatures = function _resolveFeatures(edition) {
		return ReflectionObject.prototype._resolveFeatures.call(this, this._edition || edition);
	};
	/**
	* Decorator function as returned by {@link Field.d} and {@link MapField.d} (TypeScript).
	* @typedef FieldDecorator
	* @type {function}
	* @param {Object} prototype Target prototype
	* @param {string} fieldName Field name
	* @returns {undefined}
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	/**
	* Field decorator (TypeScript).
	* @name Field.d
	* @function
	* @param {number} fieldId Field id
	* @param {"double"|"float"|"int32"|"uint32"|"sint32"|"fixed32"|"sfixed32"|"int64"|"uint64"|"sint64"|"fixed64"|"sfixed64"|"string"|"bool"|"bytes"|Object} fieldType Field type
	* @param {"optional"|"required"|"repeated"} [fieldRule="optional"] Field rule
	* @param {T} [defaultValue] Default value
	* @returns {FieldDecorator} Decorator function
	* @template T extends number | number[] | Long | Long[] | string | string[] | boolean | boolean[] | Uint8Array | Uint8Array[] | Buffer | Buffer[]
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	Field.d = function decorateField(fieldId, fieldType, fieldRule, defaultValue) {
		if (typeof fieldType === "function") fieldType = util.decorateType(fieldType).name;
		else if (fieldType && typeof fieldType === "object") fieldType = util.decorateEnum(fieldType).name;
		return function fieldDecorator(prototype, fieldName) {
			util.decorateType(prototype.constructor).add(new Field(fieldName, fieldId, fieldType, fieldRule, { "default": defaultValue }));
		};
	};
	Field._configure = function configure(Type_) {
		Type = Type_;
	};
}));
/**
* Field decorator (TypeScript).
* @name Field.d
* @function
* @param {number} fieldId Field id
* @param {Constructor<T>|string} fieldType Field type
* @param {"optional"|"required"|"repeated"} [fieldRule="optional"] Field rule
* @returns {FieldDecorator} Decorator function
* @template T extends Message<T>
* @variation 2
* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
*/
//#endregion
//#region node_modules/protobufjs/src/oneof.js
var require_oneof = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = OneOf;
	var ReflectionObject = require_object();
	OneOf.prototype = Object.create(ReflectionObject.prototype, { constructor: {
		value: OneOf,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	OneOf.className = "OneOf";
	var Field = require_field();
	var util = require_util();
	/**
	* Constructs a new oneof instance.
	* @classdesc Reflected oneof.
	* @extends ReflectionObject
	* @constructor
	* @param {string} name Oneof name
	* @param {string[]|Object.<string,*>} [fieldNames] Field names
	* @param {Object.<string,*>} [options] Declared options
	* @param {string} [comment] Comment associated with this field
	*/
	function OneOf(name, fieldNames, options, comment) {
		if (!Array.isArray(fieldNames)) {
			options = fieldNames;
			fieldNames = void 0;
		}
		ReflectionObject.call(this, name, options);
		/* istanbul ignore if */
		if (!(fieldNames === void 0 || Array.isArray(fieldNames))) throw TypeError("fieldNames must be an Array");
		/**
		* Field names that belong to this oneof.
		* @type {string[]}
		*/
		this.oneof = fieldNames || [];
		/**
		* Fields that belong to this oneof as an array for iteration.
		* @type {Field[]}
		* @readonly
		*/
		this.fieldsArray = [];
		/**
		* Comment for this field.
		* @type {string|null}
		*/
		this.comment = comment;
	}
	/**
	* Oneof descriptor.
	* @interface IOneOf
	* @property {Array.<string>} oneof Oneof field names
	* @property {Object.<string,*>} [options] Oneof options
	* @property {string|null} [comment] Oneof comment
	*/
	/**
	* Constructs a oneof from a oneof descriptor.
	* @param {string} name Oneof name
	* @param {IOneOf} json Oneof descriptor
	* @returns {OneOf} Created oneof
	* @throws {TypeError} If arguments are invalid
	*/
	OneOf.fromJSON = function fromJSON(name, json) {
		return new OneOf(name, json.oneof, json.options, json.comment);
	};
	/**
	* Converts this oneof to a oneof descriptor.
	* @param {IToJSONOptions} [toJSONOptions] JSON conversion options
	* @returns {IOneOf} Oneof descriptor
	*/
	OneOf.prototype.toJSON = function toJSON(toJSONOptions) {
		var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
		return util.toObject([
			"options",
			this.options,
			"oneof",
			this.oneof,
			"comment",
			keepComments ? this.comment : void 0
		]);
	};
	/**
	* Adds the fields of the specified oneof to the parent if not already done so.
	* @param {OneOf} oneof The oneof
	* @returns {undefined}
	* @inner
	* @ignore
	*/
	function addFieldsToParent(oneof) {
		if (oneof.parent) {
			for (var i = 0; i < oneof.fieldsArray.length; ++i) if (!oneof.fieldsArray[i].parent) oneof.parent.add(oneof.fieldsArray[i]);
		}
	}
	/**
	* Adds a field to this oneof and removes it from its current parent, if any.
	* @param {Field} field Field to add
	* @returns {OneOf} `this`
	*/
	OneOf.prototype.add = function add(field) {
		/* istanbul ignore if */
		if (!(field instanceof Field)) throw TypeError("field must be a Field");
		if (field.parent && field.parent !== this.parent) field.parent.remove(field);
		this.oneof.push(field.name);
		this.fieldsArray.push(field);
		field.partOf = this;
		addFieldsToParent(this);
		return this;
	};
	/**
	* Removes a field from this oneof and puts it back to the oneof's parent.
	* @param {Field} field Field to remove
	* @returns {OneOf} `this`
	*/
	OneOf.prototype.remove = function remove(field) {
		/* istanbul ignore if */
		if (!(field instanceof Field)) throw TypeError("field must be a Field");
		var index = this.fieldsArray.indexOf(field);
		/* istanbul ignore if */
		if (index < 0) throw Error(field + " is not a member of " + this);
		this.fieldsArray.splice(index, 1);
		index = this.oneof.indexOf(field.name);
		/* istanbul ignore else */
		if (index > -1) this.oneof.splice(index, 1);
		field.partOf = null;
		return this;
	};
	/**
	* @override
	*/
	OneOf.prototype.onAdd = function onAdd(parent) {
		ReflectionObject.prototype.onAdd.call(this, parent);
		var self = this;
		for (var i = 0; i < this.oneof.length; ++i) {
			var field = parent.get(this.oneof[i]);
			if (field && !field.partOf) {
				field.partOf = self;
				self.fieldsArray.push(field);
			}
		}
		addFieldsToParent(this);
	};
	/**
	* @override
	*/
	OneOf.prototype.onRemove = function onRemove(parent) {
		for (var i = 0, field; i < this.fieldsArray.length; ++i) if ((field = this.fieldsArray[i]).parent) field.parent.remove(field);
		ReflectionObject.prototype.onRemove.call(this, parent);
	};
	/**
	* Determines whether this field corresponds to a synthetic oneof created for
	* a proto3 optional field.  No behavioral logic should depend on this, but it
	* can be relevant for reflection.
	* @name OneOf#isProto3Optional
	* @type {boolean}
	* @readonly
	*/
	Object.defineProperty(OneOf.prototype, "isProto3Optional", { get: function() {
		if (this.fieldsArray == null || this.fieldsArray.length !== 1) return false;
		var field = this.fieldsArray[0];
		return field.options != null && field.options["proto3_optional"] === true;
	} });
	/**
	* Decorator function as returned by {@link OneOf.d} (TypeScript).
	* @typedef OneOfDecorator
	* @type {function}
	* @param {Object} prototype Target prototype
	* @param {string} oneofName OneOf name
	* @returns {undefined}
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	/**
	* OneOf decorator (TypeScript).
	* @function
	* @param {...string} fieldNames Field names
	* @returns {OneOfDecorator} Decorator function
	* @template T extends string
	* @deprecated Legacy TypeScript decorator support. Will be removed in a future release.
	*/
	OneOf.d = function decorateOneOf() {
		var fieldNames = new Array(arguments.length), index = 0;
		while (index < arguments.length) fieldNames[index] = arguments[index++];
		return function oneOfDecorator(prototype, oneofName) {
			util.decorateType(prototype.constructor).add(new OneOf(oneofName, fieldNames));
			Object.defineProperty(prototype, oneofName, {
				get: util.oneOfGetter(fieldNames),
				set: util.oneOfSetter(fieldNames)
			});
		};
	};
}));
//#endregion
//#region node_modules/protobufjs/src/object.js
var require_object = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = ReflectionObject;
	ReflectionObject.className = "ReflectionObject";
	var OneOf = require_oneof();
	var util = require_util();
	var Root;
	var editions2024Defaults = {
		enum_type: "OPEN",
		field_presence: "EXPLICIT",
		json_format: "ALLOW",
		message_encoding: "LENGTH_PREFIXED",
		repeated_field_encoding: "PACKED",
		utf8_validation: "VERIFY",
		enforce_naming_style: "STYLE2024",
		default_symbol_visibility: "EXPORT_TOP_LEVEL"
	};
	var editions2023Defaults = {
		enum_type: "OPEN",
		field_presence: "EXPLICIT",
		json_format: "ALLOW",
		message_encoding: "LENGTH_PREFIXED",
		repeated_field_encoding: "PACKED",
		utf8_validation: "VERIFY",
		enforce_naming_style: "STYLE_LEGACY",
		default_symbol_visibility: "EXPORT_ALL"
	};
	var proto2Defaults = {
		enum_type: "CLOSED",
		field_presence: "EXPLICIT",
		json_format: "LEGACY_BEST_EFFORT",
		message_encoding: "LENGTH_PREFIXED",
		repeated_field_encoding: "EXPANDED",
		utf8_validation: "NONE",
		enforce_naming_style: "STYLE_LEGACY",
		default_symbol_visibility: "EXPORT_ALL"
	};
	var proto3Defaults = {
		enum_type: "OPEN",
		field_presence: "IMPLICIT",
		json_format: "ALLOW",
		message_encoding: "LENGTH_PREFIXED",
		repeated_field_encoding: "PACKED",
		utf8_validation: "VERIFY",
		enforce_naming_style: "STYLE_LEGACY",
		default_symbol_visibility: "EXPORT_ALL"
	};
	/**
	* Constructs a new reflection object instance.
	* @classdesc Base class of all reflection objects.
	* @constructor
	* @param {string} name Object name
	* @param {Object.<string,*>} [options] Declared options
	* @abstract
	*/
	function ReflectionObject(name, options) {
		if (!util.isString(name)) throw TypeError("name must be a string");
		if (options && !util.isObject(options)) throw TypeError("options must be an object");
		/**
		* Options.
		* @type {Object.<string,*>|undefined}
		*/
		this.options = options;
		/**
		* Parsed Options.
		* @type {Array.<Object.<string,*>>|undefined}
		*/
		this.parsedOptions = null;
		/**
		* Unique name within its namespace.
		* @type {string}
		*/
		this.name = name;
		/**
		* The edition specified for this object.  Only relevant for top-level objects.
		* @type {string}
		* @private
		*/
		this._edition = null;
		/**
		* The default edition to use for this object if none is specified.  For legacy reasons,
		* this is proto2 except in the JSON parsing case where it was proto3.
		* @type {string}
		* @private
		*/
		this._defaultEdition = "proto2";
		/**
		* Resolved Features.
		* @type {object}
		* @private
		*/
		this._features = {};
		/**
		* Whether or not features have been resolved.
		* @type {boolean}
		* @private
		*/
		this._featuresResolved = false;
		/**
		* Parent namespace.
		* @type {Namespace|null}
		*/
		this.parent = null;
		/**
		* Whether already resolved or not.
		* @type {boolean}
		*/
		this.resolved = false;
		/**
		* Comment text, if any.
		* @type {string|null}
		*/
		this.comment = null;
		/**
		* Defining file name.
		* @type {string|null}
		*/
		this.filename = null;
	}
	Object.defineProperties(ReflectionObject.prototype, {
		/**
		* Reference to the root namespace.
		* @name ReflectionObject#root
		* @type {Root}
		* @readonly
		*/
		root: { get: function() {
			var ptr = this;
			while (ptr.parent !== null) ptr = ptr.parent;
			return ptr;
		} },
		/**
		* Full name including leading dot.
		* @name ReflectionObject#fullName
		* @type {string}
		* @readonly
		*/
		fullName: { get: function() {
			var path = [this.name], ptr = this.parent;
			while (ptr) {
				path.unshift(ptr.name);
				ptr = ptr.parent;
			}
			return path.join(".");
		} }
	});
	/**
	* Converts this reflection object to its descriptor representation.
	* @returns {Object.<string,*>} Descriptor
	*/
	ReflectionObject.prototype.toJSON = function toJSON() {
		throw Error();
	};
	/**
	* Called when this object is added to a parent.
	* @param {ReflectionObject} parent Parent added to
	* @returns {undefined}
	*/
	ReflectionObject.prototype.onAdd = function onAdd(parent) {
		if (this.parent && this.parent !== parent) this.parent.remove(this);
		this.parent = parent;
		this.resolved = false;
		var root = parent.root;
		if (root instanceof Root) root._handleAdd(this);
	};
	/**
	* Called when this object is removed from a parent.
	* @param {ReflectionObject} parent Parent removed from
	* @returns {undefined}
	*/
	ReflectionObject.prototype.onRemove = function onRemove(parent) {
		var root = parent.root;
		if (root instanceof Root) root._handleRemove(this);
		this.parent = null;
		this.resolved = false;
	};
	/**
	* Resolves this objects type references.
	* @returns {ReflectionObject} `this`
	*/
	ReflectionObject.prototype.resolve = function resolve() {
		if (this.resolved) return this;
		if (this.root instanceof Root) this.resolved = true;
		return this;
	};
	/**
	* Resolves this objects editions features.
	* @param {string} edition The edition we're currently resolving for.
	* @returns {ReflectionObject} `this`
	*/
	ReflectionObject.prototype._resolveFeaturesRecursive = function _resolveFeaturesRecursive(edition) {
		return this._resolveFeatures(this._edition || edition);
	};
	/**
	* Resolves child features from parent features
	* @param {string} edition The edition we're currently resolving for.
	* @returns {undefined}
	*/
	ReflectionObject.prototype._resolveFeatures = function _resolveFeatures(edition) {
		if (this._featuresResolved) return;
		var defaults = {};
		/* istanbul ignore if */
		if (!edition) throw new Error("Unknown edition for " + this.fullName);
		var protoFeatures = util.merge({}, this.options && this.options.features, this._inferLegacyProtoFeatures(edition));
		if (this._edition) {
			/* istanbul ignore else */
			if (edition === "proto2") defaults = Object.assign({}, proto2Defaults);
			else if (edition === "proto3") defaults = Object.assign({}, proto3Defaults);
			else if (edition === "2023") defaults = Object.assign({}, editions2023Defaults);
			else if (edition === "2024") defaults = Object.assign({}, editions2024Defaults);
			else throw new Error("Unknown edition: " + edition);
			this._features = util.merge(defaults, protoFeatures);
		} else if (this.partOf instanceof OneOf) {
			var lexicalParentFeaturesCopy = util.merge({}, this.partOf._features);
			this._features = util.merge(lexicalParentFeaturesCopy, protoFeatures);
		} else if (this.declaringField) {} else if (this.parent) {
			var parentFeaturesCopy = util.merge({}, this.parent._features);
			this._features = util.merge(parentFeaturesCopy, protoFeatures);
		} else throw new Error("Unable to find a parent for " + this.fullName);
		if (this.extensionField) this.extensionField._features = this._features;
		this._featuresResolved = true;
	};
	/**
	* Infers features from legacy syntax that may have been specified differently.
	* in older editions.
	* @param {string|undefined} edition The edition this proto is on, or undefined if pre-editions
	* @returns {object} The feature values to override
	*/
	ReflectionObject.prototype._inferLegacyProtoFeatures = function _inferLegacyProtoFeatures() {
		return {};
	};
	/**
	* Gets an option value.
	* @param {string} name Option name
	* @returns {*} Option value or `undefined` if not set
	*/
	ReflectionObject.prototype.getOption = function getOption(name) {
		if (this.options && Object.prototype.hasOwnProperty.call(this.options, name)) return this.options[name];
	};
	/**
	* Sets an option.
	* @param {string} name Option name
	* @param {*} value Option value
	* @param {boolean|undefined} [ifNotSet] Sets the option only if it isn't currently set
	* @returns {ReflectionObject} `this`
	*/
	ReflectionObject.prototype.setOption = function setOption(name, value, ifNotSet) {
		if (name === "__proto__") return this;
		if (!this.options) this.options = {};
		if (/^features\./.test(name)) util.setProperty(this.options, name, value, ifNotSet);
		else {
			var prev = this.getOption(name);
			if (!ifNotSet || prev === void 0) {
				if (prev !== value) this.resolved = false;
				this.options[name] = value;
			}
		}
		return this;
	};
	/**
	* Sets a parsed option.
	* @param {string} name parsed Option name
	* @param {*} value Option value
	* @param {string} propName dot '.' delimited full path of property within the option to set. if undefined\empty, will add a new option with that value
	* @returns {ReflectionObject} `this`
	*/
	ReflectionObject.prototype.setParsedOption = function setParsedOption(name, value, propName) {
		if (name === "__proto__") return this;
		if (!this.parsedOptions) this.parsedOptions = [];
		var parsedOptions = this.parsedOptions;
		if (propName) {
			var opt = parsedOptions.find(function(opt) {
				return Object.prototype.hasOwnProperty.call(opt, name);
			});
			if (opt) {
				var newValue = opt[name];
				util.setProperty(newValue, propName, value);
			} else {
				opt = {};
				opt[name] = util.setProperty({}, propName, value);
				parsedOptions.push(opt);
			}
		} else {
			var newOpt = {};
			newOpt[name] = value;
			parsedOptions.push(newOpt);
		}
		return this;
	};
	/**
	* Sets multiple options.
	* @param {Object.<string,*>} options Options to set
	* @param {boolean} [ifNotSet] Sets an option only if it isn't currently set
	* @returns {ReflectionObject} `this`
	*/
	ReflectionObject.prototype.setOptions = function setOptions(options, ifNotSet) {
		if (options) for (var keys = Object.keys(options), i = 0; i < keys.length; ++i) this.setOption(keys[i], options[keys[i]], ifNotSet);
		return this;
	};
	/**
	* Converts this instance to its string representation.
	* @name ReflectionObject#toString
	* @function
	* @returns {string} Class name[, space, full name]
	*/
	Object.defineProperty(ReflectionObject.prototype, "toString", {
		value: function toString() {
			var className = this.constructor.className, fullName = this.fullName;
			if (fullName.length) return className + " " + fullName;
			return className;
		},
		writable: true,
		enumerable: false,
		configurable: true
	});
	/**
	* Converts the edition this object is pinned to for JSON format.
	* @returns {string|undefined} The edition string for JSON representation
	*/
	ReflectionObject.prototype._editionToJSON = function _editionToJSON() {
		if (!this._edition || this._edition === "proto3") return;
		return this._edition;
	};
	ReflectionObject._configure = function(Root_) {
		Root = Root_;
	};
}));
//#endregion
//#region node_modules/protobufjs/src/enum.js
var require_enum = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Enum;
	var ReflectionObject = require_object();
	Enum.prototype = Object.create(ReflectionObject.prototype, { constructor: {
		value: Enum,
		writable: true,
		enumerable: false,
		configurable: true
	} });
	Enum.className = "Enum";
	var Namespace = require_namespace();
	var util = require_util();
	/**
	* Constructs a new enum instance.
	* @classdesc Reflected enum.
	* @extends ReflectionObject
	* @constructor
	* @param {string} name Unique name within its namespace
	* @param {Object.<string,number>} [values] Enum values as an object, by name
	* @param {Object.<string,*>} [options] Declared options
	* @param {string} [comment] The comment for this enum
	* @param {Object.<string,string|null>} [comments] The value comments for this enum
	* @param {Object.<string,Object<string,*>>|undefined} [valuesOptions] The value options for this enum
	*/
	function Enum(name, values, options, comment, comments, valuesOptions) {
		ReflectionObject.call(this, name, options);
		if (values && typeof values !== "object") throw TypeError("values must be an object");
		/**
		* Enum values by id.
		* @type {Object.<number,string>}
		*/
		this.valuesById = Object.create(null);
		/**
		* Enum values by name.
		* @type {Object.<string,number>}
		*/
		this.values = Object.create(this.valuesById);
		/**
		* Enum comment text.
		* @type {string|null}
		*/
		this.comment = comment;
		/**
		* Value comment texts, if any.
		* @type {Object.<string,string|null>}
		*/
		this.comments = comments || {};
		/**
		* Values options, if any
		* @type {Object<string, Object<string, *>>|undefined}
		*/
		this.valuesOptions = valuesOptions;
		/**
		* Resolved values features, if any
		* @type {Object<string, Object<string, *>>|undefined}
		*/
		this._valuesFeatures = {};
		/**
		* Reserved ranges, if any.
		* @type {Array.<number[]|string>}
		*/
		this.reserved = void 0;
		if (values) {
			for (var keys = Object.keys(values), i = 0; i < keys.length; ++i) if (keys[i] !== "__proto__" && typeof values[keys[i]] === "number") {
				this.values[keys[i]] = values[keys[i]];
				if (this.valuesById[values[keys[i]]] === void 0) this.valuesById[values[keys[i]]] = keys[i];
			}
		}
	}
	/**
	* @override
	*/
	Enum.prototype._resolveFeatures = function _resolveFeatures(edition) {
		edition = this._edition || edition;
		ReflectionObject.prototype._resolveFeatures.call(this, edition);
		Object.keys(this.values).forEach((key) => {
			var parentFeaturesCopy = util.merge({}, this._features);
			this._valuesFeatures[key] = util.merge(parentFeaturesCopy, this.valuesOptions && this.valuesOptions[key] && this.valuesOptions[key].features || {});
		});
		return this;
	};
	/**
	* Enum descriptor.
	* @interface IEnum
	* @property {string} [edition] Edition
	* @property {Object.<string,number>} values Enum values
	* @property {Object.<string,*>} [options] Enum options
	* @property {Object.<string,Object.<string,*>>} [valuesOptions] Enum value options
	* @property {Array.<number[]|string>} [reserved] Reserved ranges
	* @property {string|null} [comment] Enum comment
	* @property {Object.<string,string|null>} [comments] Value comments
	*/
	/**
	* Constructs an enum from an enum descriptor.
	* @param {string} name Enum name
	* @param {IEnum} json Enum descriptor
	* @returns {Enum} Created enum
	* @throws {TypeError} If arguments are invalid
	*/
	Enum.fromJSON = function fromJSON(name, json) {
		var enm = new Enum(name, json.values, json.options, json.comment, json.comments, json.valuesOptions);
		enm.reserved = json.reserved;
		if (json.edition) enm._edition = json.edition;
		enm._defaultEdition = "proto3";
		return enm;
	};
	/**
	* Converts this enum to an enum descriptor.
	* @param {IToJSONOptions} [toJSONOptions] JSON conversion options
	* @returns {IEnum} Enum descriptor
	*/
	Enum.prototype.toJSON = function toJSON(toJSONOptions) {
		var keepComments = toJSONOptions ? Boolean(toJSONOptions.keepComments) : false;
		return util.toObject([
			"edition",
			this._editionToJSON(),
			"options",
			this.options,
			"valuesOptions",
			this.valuesOptions,
			"values",
			this.values,
			"reserved",
			this.reserved && this.reserved.length ? this.reserved : void 0,
			"comment",
			keepComments ? this.comment : void 0,
			"comments",
			keepComments ? this.comments : void 0
		]);
	};
	/**
	* Adds a value to this enum.
	* @param {string} name Value name
	* @param {number} id Value id
	* @param {string} [comment] Comment, if any
	* @param {Object.<string, *>|undefined} [options] Options, if any
	* @returns {Enum} `this`
	* @throws {TypeError} If arguments are invalid
	* @throws {Error} If there is already a value with this name or id
	*/
	Enum.prototype.add = function add(name, id, comment, options) {
		if (!util.isString(name)) throw TypeError("name must be a string");
		if (!util.isInteger(id)) throw TypeError("id must be an integer");
		if (name === "__proto__") return this;
		if (this.values[name] !== void 0) throw Error("duplicate name '" + name + "' in " + this);
		if (this.isReservedId(id)) throw Error("id " + id + " is reserved in " + this);
		if (this.isReservedName(name)) throw Error("name '" + name + "' is reserved in " + this);
		if (this.valuesById[id] !== void 0) {
			if (!(this.options && this.options.allow_alias)) throw Error("duplicate id " + id + " in " + this);
			this.values[name] = id;
		} else this.valuesById[this.values[name] = id] = name;
		if (options) {
			if (this.valuesOptions === void 0) this.valuesOptions = {};
			this.valuesOptions[name] = options || null;
		}
		this.comments[name] = comment || null;
		return this;
	};
	/**
	* Removes a value from this enum
	* @param {string} name Value name
	* @returns {Enum} `this`
	* @throws {TypeError} If arguments are invalid
	* @throws {Error} If `name` is not a name of this enum
	*/
	Enum.prototype.remove = function remove(name) {
		if (!util.isString(name)) throw TypeError("name must be a string");
		var val = this.values[name];
		if (val == null) throw Error("name '" + name + "' does not exist in " + this);
		delete this.valuesById[val];
		delete this.values[name];
		delete this.comments[name];
		if (this.valuesOptions) delete this.valuesOptions[name];
		return this;
	};
	/**
	* Tests if the specified id is reserved.
	* @param {number} id Id to test
	* @returns {boolean} `true` if reserved, otherwise `false`
	*/
	Enum.prototype.isReservedId = function isReservedId(id) {
		return Namespace.isReservedId(this.reserved, id);
	};
	/**
	* Tests if the specified name is reserved.
	* @param {string} name Name to test
	* @returns {boolean} `true` if reserved, otherwise `false`
	*/
	Enum.prototype.isReservedName = function isReservedName(name) {
		return Namespace.isReservedName(this.reserved, name);
	};
}));
//#endregion
//#region node_modules/protobufjs/src/encoder.js
var require_encoder = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = encoder;
	var Enum = require_enum();
	var types = require_types();
	var util = require_util();
	/**
	* Generates a partial message type encoder.
	* @param {Codegen} gen Codegen instance
	* @param {Field} field Reflected field
	* @param {number} fieldIndex Field index
	* @param {string} ref Variable reference
	* @returns {Codegen} Codegen instance
	* @ignore
	*/
	function genTypePartial(gen, field, fieldIndex, ref) {
		return field.delimited ? gen("types[%i].encode(%s,w.uint32(%i),q+1).uint32(%i)", fieldIndex, ref, (field.id << 3 | 3) >>> 0, (field.id << 3 | 4) >>> 0) : gen("types[%i].encode(%s,w.uint32(%i).fork(),q+1).ldelim()", fieldIndex, ref, (field.id << 3 | 2) >>> 0);
	}
	/**
	* Generates an encoder specific to the specified message type.
	* @param {Type} mtype Message type
	* @returns {Codegen} Codegen instance
	*/
	function encoder(mtype) {
		var gen = util.codegen([
			"m",
			"w",
			"q"
		])("if(!w)")("w=Writer.create()")("if(q===undefined)q=0")("if(q>util.recursionLimit)")("throw Error(\"max depth exceeded\")");
		var i, ref;
		var fields = mtype.fieldsArray.slice().sort(util.compareFieldsById);
		for (var i = 0; i < fields.length; ++i) {
			var field = fields[i].resolve(), index = mtype._fieldsArray.indexOf(field), type = field.resolvedType instanceof Enum ? "int32" : field.type, wireType = types.basic[type];
			ref = "m" + util.safeProp(field.name);
			if (field.map) {
				gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)){", ref, field.name)("for(var ks=Object.keys(%s),i=0;i<ks.length;++i){", ref);
				if (field.keyType === "bool") gen("w.uint32(%i).fork().uint32(%i).bool(util.boolFromKey(ks[i]))", (field.id << 3 | 2) >>> 0, 8 | types.mapKey[field.keyType]);
				else if (types.long[field.keyType] !== void 0) gen("w.uint32(%i).fork().uint32(%i).%s(util.longFromKey(ks[i],%j))", (field.id << 3 | 2) >>> 0, 8 | types.mapKey[field.keyType], field.keyType, field.keyType === "uint64" || field.keyType === "fixed64");
				else gen("w.uint32(%i).fork().uint32(%i).%s(ks[i])", (field.id << 3 | 2) >>> 0, 8 | types.mapKey[field.keyType], field.keyType);
				if (wireType === void 0) gen("types[%i].encode(%s[ks[i]],w.uint32(18).fork(),q+1).ldelim().ldelim()", index, ref);
				else gen(".uint32(%i).%s(%s[ks[i]]).ldelim()", 16 | wireType, type, ref);
				gen("}")("}");
			} else if (field.repeated) {
				gen("if(%s!=null&&%s.length){", ref, ref);
				if (field.packed && types.packed[type] !== void 0) gen("w.uint32(%i).%ss(%s)", (field.id << 3 | 2) >>> 0, type, ref);
				else {
					gen("for(var i=0;i<%s.length;++i)", ref);
					if (wireType === void 0) genTypePartial(gen, field, index, ref + "[i]");
					else gen("w.uint32(%i).%s(%s[i])", (field.id << 3 | wireType) >>> 0, type, ref);
				}
				gen("}");
			} else {
				if (!field.required) if (field.hasPresence || !(field.resolvedType instanceof Enum || types.basic[type] !== void 0)) gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j))", ref, field.name);
				else if (field.resolvedType instanceof Enum) gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)&&%s!==%j)", ref, field.name, ref, field.typeDefault);
				else if (type === "bool") gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)&&%s!==false)", ref, field.name, ref);
				else if (type === "string") gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)&&%s!==\"\")", ref, field.name, ref);
				else if (type === "bytes") gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)&&%s.length)", ref, field.name, ref);
				else if (type === "double" || type === "float") gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)&&!Object.is(%s,0))", ref, field.name, ref);
				else if (types.long[type] !== void 0) gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)&&(typeof %s===\"object\"?%s.low||%s.high:%s!==0))", ref, field.name, ref, ref, ref, ref);
				else gen("if(%s!=null&&Object.hasOwnProperty.call(m,%j)&&%s!==0)", ref, field.name, ref);
				if (wireType === void 0) genTypePartial(gen, field, index, ref);
				else gen("w.uint32(%i).%s(%s)", (field.id << 3 | wireType) >>> 0, type, ref);
			}
		}
		return gen("if(m.$unknowns!=null&&Object.hasOwnProperty.call(m,\"$unknowns\"))")("for(var i=0;i<m.$unknowns.length;++i)")("w.raw(m.$unknowns[i])")("return w");
	}
}));
//#endregion
//#region node_modules/protobufjs/src/index-light.js
var require_index_light = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	exports = module.exports = require_index_minimal();
	exports.build = "light";
	/**
	* A node-style callback as used by {@link load} and {@link Root#load}.
	* @typedef LoadCallback
	* @type {function}
	* @param {Error|null} error Error, if any, otherwise `null`
	* @param {Root} [root] Root, if there hasn't been an error
	* @returns {undefined}
	*/
	/**
	* Loads one or multiple .proto or preprocessed .json files into a common root namespace and calls the callback.
	* @param {string|string[]} filename One or multiple files to load
	* @param {Root} root Root namespace, defaults to create a new one if omitted.
	* @param {LoadCallback} callback Callback function
	* @returns {undefined}
	* @see {@link Root#load}
	*/
	function load(filename, root, callback) {
		if (typeof root === "function") {
			callback = root;
			root = new exports.Root();
		} else if (!root) root = new exports.Root();
		return root.load(filename, callback);
	}
	/**
	* Loads one or multiple .proto or preprocessed .json files into a common root namespace and calls the callback.
	* @name load
	* @function
	* @param {string|string[]} filename One or multiple files to load
	* @param {LoadCallback} callback Callback function
	* @returns {undefined}
	* @see {@link Root#load}
	* @variation 2
	*/
	/**
	* Loads one or multiple .proto or preprocessed .json files into a common root namespace and returns a promise.
	* @name load
	* @function
	* @param {string|string[]} filename One or multiple files to load
	* @param {Root} [root] Root namespace, defaults to create a new one if omitted.
	* @returns {Promise<Root>} Promise
	* @see {@link Root#load}
	* @variation 3
	*/
	exports.load = load;
	/**
	* Synchronously loads one or multiple .proto or preprocessed .json files into a common root namespace (node only).
	* @param {string|string[]} filename One or multiple files to load
	* @param {Root} [root] Root namespace, defaults to create a new one if omitted.
	* @returns {Root} Root namespace
	* @throws {Error} If synchronous fetching is not supported (i.e. in browsers) or if a file's syntax is invalid
	* @see {@link Root#loadSync}
	*/
	function loadSync(filename, root) {
		if (!root) root = new exports.Root();
		return root.loadSync(filename);
	}
	exports.loadSync = loadSync;
	exports.encoder = require_encoder();
	exports.decoder = require_decoder();
	exports.verifier = require_verifier();
	exports.converter = require_converter();
	exports.ReflectionObject = require_object();
	exports.Namespace = require_namespace();
	exports.Root = require_root();
	exports.Enum = require_enum();
	exports.Type = require_type();
	exports.Field = require_field();
	exports.OneOf = require_oneof();
	exports.MapField = require_mapfield();
	exports.Service = require_service();
	exports.Method = require_method();
	exports.Message = require_message();
	exports.wrappers = require_wrappers();
	exports.types = require_types();
	exports.util = require_util();
	exports.ReflectionObject._configure(exports.Root);
	exports.Namespace._configure(exports.Type, exports.Service, exports.Enum);
	exports.Root._configure(exports.Type, void 0, {});
	exports.Field._configure(exports.Type);
}));
//#endregion
//#region node_modules/protobufjs/src/tokenize.js
var require_tokenize = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = tokenize;
	var delimRe = /[\s{}=;:[\],'"()<>]/g;
	var stringDoubleRe = /(?:"([^"\\]*(?:\\.[^"\\]*)*)")/g;
	var stringSingleRe = /(?:'([^'\\]*(?:\\.[^'\\]*)*)')/g;
	var setCommentRe = /^ *[*/]+ */;
	var setCommentAltRe = /^\s*\*?\/*/;
	var setCommentSplitRe = /\n/g;
	var whitespaceRe = /\s/;
	var unescapeRe = /\\(.?)/g;
	var unescapeMap = {
		"0": "\0",
		"r": "\r",
		"n": "\n",
		"t": "	"
	};
	/**
	* Unescapes a string.
	* @param {string} str String to unescape
	* @returns {string} Unescaped string
	* @property {Object.<string,string>} map Special characters map
	* @memberof tokenize
	*/
	function unescape(str) {
		return str.replace(unescapeRe, function($0, $1) {
			switch ($1) {
				case "\\":
				case "": return $1;
				default: return unescapeMap[$1] || "";
			}
		});
	}
	tokenize.unescape = unescape;
	/**
	* Gets the next token and advances.
	* @typedef TokenizerHandleNext
	* @type {function}
	* @returns {string|null} Next token or `null` on eof
	*/
	/**
	* Peeks for the next token.
	* @typedef TokenizerHandlePeek
	* @type {function}
	* @returns {string|null} Next token or `null` on eof
	*/
	/**
	* Pushes a token back to the stack.
	* @typedef TokenizerHandlePush
	* @type {function}
	* @param {string} token Token
	* @returns {undefined}
	*/
	/**
	* Skips the next token.
	* @typedef TokenizerHandleSkip
	* @type {function}
	* @param {string} expected Expected token
	* @param {boolean} [optional=false] If optional
	* @returns {boolean} Whether the token matched
	* @throws {Error} If the token didn't match and is not optional
	*/
	/**
	* Gets the comment on the previous line or, alternatively, the line comment on the specified line.
	* @typedef TokenizerHandleCmnt
	* @type {function}
	* @param {number} [line] Line number
	* @returns {string|null} Comment text or `null` if none
	*/
	/**
	* Handle object returned from {@link tokenize}.
	* @interface ITokenizerHandle
	* @property {TokenizerHandleNext} next Gets the next token and advances (`null` on eof)
	* @property {TokenizerHandlePeek} peek Peeks for the next token (`null` on eof)
	* @property {TokenizerHandlePush} push Pushes a token back to the stack
	* @property {TokenizerHandleSkip} skip Skips a token, returns its presence and advances or, if non-optional and not present, throws
	* @property {TokenizerHandleCmnt} cmnt Gets the comment on the previous line or the line comment on the specified line, if any
	* @property {number} line Current line number
	*/
	/**
	* Tokenizes the given .proto source and returns an object with useful utility functions.
	* @param {string} source Source contents
	* @param {boolean} alternateCommentMode Whether we should activate alternate comment parsing mode.
	* @returns {ITokenizerHandle} Tokenizer handle
	*/
	function tokenize(source, alternateCommentMode) {
		source = source.toString();
		var offset = 0, length = source.length, line = 1, lastCommentLine = 0, comments = {};
		var stack = [];
		var stringDelim = null;
		/* istanbul ignore next */
		/**
		* Creates an error for illegal syntax.
		* @param {string} subject Subject
		* @returns {Error} Error created
		* @inner
		*/
		function illegal(subject) {
			return Error("illegal " + subject + " (line " + line + ")");
		}
		/**
		* Reads a string till its end.
		* @returns {string} String read
		* @inner
		*/
		function readString() {
			var re = stringDelim === "'" ? stringSingleRe : stringDoubleRe;
			re.lastIndex = offset - 1;
			var match = re.exec(source);
			if (!match) throw illegal("string");
			offset = re.lastIndex;
			push(stringDelim);
			stringDelim = null;
			return unescape(match[1]);
		}
		/**
		* Gets the character at `pos` within the source.
		* @param {number} pos Position
		* @returns {string} Character
		* @inner
		*/
		function charAt(pos) {
			return source.charAt(pos);
		}
		/**
		* Sets the current comment text.
		* @param {number} start Start offset
		* @param {number} end End offset
		* @param {boolean} isLeading set if a leading comment
		* @returns {undefined}
		* @inner
		*/
		function setComment(start, end, isLeading) {
			var comment = {
				type: source.charAt(start++),
				lineEmpty: false,
				leading: isLeading
			};
			var lookback;
			if (alternateCommentMode) lookback = 2;
			else lookback = 3;
			var commentOffset = start - lookback, c;
			do
				if (--commentOffset < 0 || (c = source.charAt(commentOffset)) === "\n") {
					comment.lineEmpty = true;
					break;
				}
			while (c === " " || c === "	");
			var lines = source.substring(start, end).split(setCommentSplitRe);
			for (var i = 0; i < lines.length; ++i) lines[i] = lines[i].replace(alternateCommentMode ? setCommentAltRe : setCommentRe, "").trim();
			comment.text = lines.join("\n").trim();
			comments[line] = comment;
			lastCommentLine = line;
		}
		function isDoubleSlashCommentLine(startOffset) {
			var endOffset = findEndOfLine(startOffset);
			var lineText = source.substring(startOffset, endOffset);
			return /^\s*\/\//.test(lineText);
		}
		function findEndOfLine(cursor) {
			var endOffset = cursor;
			while (endOffset < length && charAt(endOffset) !== "\n") endOffset++;
			return endOffset;
		}
		/**
		* Obtains the next token.
		* @returns {string|null} Next token or `null` on eof
		* @inner
		*/
		function next() {
			if (stack.length > 0) return stack.shift();
			if (stringDelim) return readString();
			var repeat, prev, curr, start, isDoc, nextLineIsComment, isLeadingComment = offset === 0;
			do {
				if (offset === length) return null;
				repeat = false;
				while (whitespaceRe.test(curr = charAt(offset))) {
					if (curr === "\n") {
						isLeadingComment = true;
						++line;
					}
					if (++offset === length) return null;
				}
				if (charAt(offset) === "/") {
					if (++offset === length) throw illegal("comment");
					if (charAt(offset) === "/") {
						if (!alternateCommentMode) {
							isDoc = charAt(start = offset + 1) === "/";
							while (charAt(++offset) !== "\n") if (offset === length) return null;
							++offset;
							if (isDoc) {
								setComment(start, offset - 1, isLeadingComment);
								isLeadingComment = true;
							}
							++line;
							repeat = true;
						} else {
							start = offset;
							isDoc = false;
							if (isDoubleSlashCommentLine(offset - 1)) {
								isDoc = true;
								do {
									offset = findEndOfLine(offset);
									if (offset === length) break;
									offset++;
									if (!isLeadingComment) break;
									nextLineIsComment = isDoubleSlashCommentLine(offset);
									if (nextLineIsComment) line++;
								} while (nextLineIsComment);
							} else offset = Math.min(length, findEndOfLine(offset) + 1);
							if (isDoc) {
								setComment(start, offset, isLeadingComment);
								isLeadingComment = true;
							}
							line++;
							repeat = true;
						}
					} else if ((curr = charAt(offset)) === "*") {
						start = offset + 1;
						isDoc = alternateCommentMode || charAt(start) === "*";
						do {
							if (curr === "\n") ++line;
							if (++offset === length) throw illegal("comment");
							prev = curr;
							curr = charAt(offset);
						} while (prev !== "*" || curr !== "/");
						++offset;
						if (isDoc) {
							setComment(start, offset - 2, isLeadingComment);
							isLeadingComment = true;
						}
						repeat = true;
					} else return "/";
				}
			} while (repeat);
			var end = offset;
			delimRe.lastIndex = 0;
			if (!delimRe.test(charAt(end++))) while (end < length && !delimRe.test(charAt(end))) ++end;
			var token = source.substring(offset, offset = end);
			if (token === "\"" || token === "'") stringDelim = token;
			return token;
		}
		/**
		* Pushes a token back to the stack.
		* @param {string} token Token
		* @returns {undefined}
		* @inner
		*/
		function push(token) {
			stack.push(token);
		}
		/**
		* Peeks for the next token.
		* @returns {string|null} Token or `null` on eof
		* @inner
		*/
		function peek() {
			if (!stack.length) {
				var token = next();
				if (token === null) return null;
				push(token);
			}
			return stack[0];
		}
		/**
		* Skips a token.
		* @param {string} expected Expected token
		* @param {boolean} [optional=false] Whether the token is optional
		* @returns {boolean} `true` when skipped, `false` if not
		* @throws {Error} When a required token is not present
		* @inner
		*/
		function skip(expected, optional) {
			var actual = peek();
			if (actual === expected) {
				next();
				return true;
			}
			if (!optional) throw illegal("token '" + actual + "', '" + expected + "' expected");
			return false;
		}
		/**
		* Gets a comment.
		* @param {number} [trailingLine] Line number if looking for a trailing comment
		* @returns {string|null} Comment text
		* @inner
		*/
		function cmnt(trailingLine) {
			var ret = null;
			var comment;
			if (trailingLine === void 0) {
				comment = comments[line - 1];
				delete comments[line - 1];
				if (comment && (alternateCommentMode || comment.type === "*" || comment.lineEmpty)) ret = comment.leading ? comment.text : null;
			} else {
				/* istanbul ignore else */
				if (lastCommentLine < trailingLine) peek();
				comment = comments[trailingLine];
				delete comments[trailingLine];
				if (comment && !comment.lineEmpty && (alternateCommentMode || comment.type === "/")) ret = comment.leading ? null : comment.text;
			}
			return ret;
		}
		return Object.defineProperty({
			next,
			peek,
			push,
			skip,
			cmnt
		}, "line", { get: function() {
			return line;
		} });
	}
}));
//#endregion
//#region node_modules/protobufjs/src/parse.js
var require_parse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = parse;
	parse.filename = null;
	parse.defaults = { keepCase: false };
	var tokenize = require_tokenize();
	var Root = require_root();
	var Type = require_type();
	var Field = require_field();
	var MapField = require_mapfield();
	var OneOf = require_oneof();
	var Enum = require_enum();
	var Service = require_service();
	var Method = require_method();
	var ReflectionObject = require_object();
	var types = require_types();
	var util = require_util();
	var base10Re = /^[1-9][0-9]*$/;
	var base10NegRe = /^-?[1-9][0-9]*$/;
	var base16Re = /^0[x][0-9a-fA-F]+$/;
	var base16NegRe = /^-?0[x][0-9a-fA-F]+$/;
	var base8Re = /^0[0-7]+$/;
	var base8NegRe = /^-?0[0-7]+$/;
	var integerTypeRe = /^(?:u?int|sint|s?fixed)(?:32|64)$/;
	var unsignedTypeRe = /^(?:uint|fixed)(?:32|64)$/;
	var numberRe = util.patterns.numberRe;
	var nameRe = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
	var typeRefRe = util.patterns.typeRefRe;
	var maxFieldId = 536870911;
	var maxEnumId = 2147483647;
	/**
	* Result object returned from {@link parse}.
	* @interface IParserResult
	* @property {string|undefined} package Package name, if declared
	* @property {string[]|undefined} imports Imports, if any
	* @property {string[]|undefined} weakImports Weak imports, if any
	* @property {Root} root Populated root instance
	*/
	/**
	* Options modifying the behavior of {@link parse}.
	* @interface IParseOptions
	* @property {boolean} [keepCase=false] Keeps field casing instead of converting to camel case
	* @property {boolean} [alternateCommentMode=false] Recognize double-slash comments in addition to doc-block comments.
	* @property {boolean} [preferTrailingComment=false] Use trailing comment when both leading comment and trailing comment exist.
	*/
	/**
	* Options modifying the behavior of JSON serialization.
	* @interface IToJSONOptions
	* @property {boolean} [keepComments=false] Serializes comments.
	*/
	/**
	* Parses the given .proto source and returns an object with the parsed contents.
	* @param {string} source Source contents
	* @param {Root} root Root to populate
	* @param {IParseOptions} [options] Parse options. Defaults to {@link parse.defaults} when omitted.
	* @returns {IParserResult} Parser result
	* @property {string} filename=null Currently processing file name for error reporting, if known
	* @property {IParseOptions} defaults Default {@link IParseOptions}
	*/
	function parse(source, root, options) {
		if (!(root instanceof Root)) {
			options = root;
			root = new Root();
		}
		if (!options) options = parse.defaults;
		var preferTrailingComment = options.preferTrailingComment || false;
		var tn = tokenize(source, options.alternateCommentMode || false), next = tn.next, push = tn.push, peek = tn.peek, skip = tn.skip, cmnt = tn.cmnt;
		var head = true, pkg, imports, weakImports, edition = "proto2";
		var ptr = root;
		var topLevelObjects = [];
		var topLevelOptions = {};
		var applyCase = options.keepCase ? function(name) {
			return name;
		} : util.camelCase;
		function resolveFileFeatures() {
			topLevelObjects.forEach((obj) => {
				obj._edition = edition;
				Object.keys(topLevelOptions).forEach((opt) => {
					if (obj.getOption(opt) !== void 0) return;
					obj.setOption(opt, topLevelOptions[opt], true);
				});
			});
		}
		/* istanbul ignore next */
		function illegal(token, name, insideTryCatch) {
			var filename = parse.filename;
			if (!insideTryCatch) parse.filename = null;
			return Error("illegal " + (name || "token") + " '" + token + "' (" + (filename ? filename + ", " : "") + "line " + tn.line + ")");
		}
		function readString() {
			var values = [], token;
			do {
				/* istanbul ignore if */
				if ((token = next()) !== "\"" && token !== "'") throw illegal(token);
				values.push(next());
				skip(token);
				token = peek();
			} while (token === "\"" || token === "'");
			return values.join("");
		}
		function readValue(acceptTypeRef) {
			var token = next();
			switch (token) {
				case "'":
				case "\"":
					push(token);
					return readString();
				case "true":
				case "TRUE": return true;
				case "false":
				case "FALSE": return false;
			}
			try {
				return parseNumber(token, true);
			} catch (e) {
				/* istanbul ignore else */
				if (acceptTypeRef && typeRefRe.test(token)) return token;
				/* istanbul ignore next */
				throw illegal(token, "value");
			}
		}
		function readRanges(target, acceptStrings, max, acceptNegative) {
			var token, start;
			do
				if (acceptStrings && ((token = peek()) === "\"" || token === "'")) {
					var str = readString();
					target.push(str);
					if (edition >= 2023) throw illegal(str, "id");
				} else try {
					target.push([start = parseId(next(), acceptNegative, max), skip("to", true) ? parseId(next(), acceptNegative, max) : start]);
				} catch (err) {
					if (acceptStrings && typeRefRe.test(token) && edition >= 2023) target.push(token);
					else throw err;
				}
			while (skip(",", true));
			var dummy = { options: void 0 };
			dummy.setOption = function(name, value) {
				if (this.options === void 0) this.options = {};
				this.options[name] = value;
			};
			ifBlock(dummy, function parseRange_block(token) {
				/* istanbul ignore else */
				if (token === "option") {
					parseOption(dummy, token);
					skip(";");
				} else throw illegal(token);
			}, function parseRange_line() {
				parseInlineOptions(dummy);
			});
		}
		function parseNumber(token, insideTryCatch) {
			var sign = 1;
			if (token.charAt(0) === "-") {
				sign = -1;
				token = token.substring(1);
			}
			switch (token) {
				case "inf":
				case "INF":
				case "Inf": return sign * Infinity;
				case "nan":
				case "NAN":
				case "Nan":
				case "NaN": return NaN;
				case "0": return sign * 0;
			}
			if (base10Re.test(token)) return sign * parseInt(token, 10);
			if (base16Re.test(token)) return sign * parseInt(token, 16);
			if (base8Re.test(token)) return sign * parseInt(token, 8);
			/* istanbul ignore else */
			if (numberRe.test(token)) return sign * parseFloat(token);
			/* istanbul ignore next */
			throw illegal(token, "number", insideTryCatch);
		}
		function parseInteger(token, acceptNegative, name) {
			if (token === null) throw illegal(token, "end of input");
			if (!acceptNegative && token.charAt(0) === "-") throw illegal(token, name || "integer");
			if (token === "0" || token === "-0") return 0;
			var value;
			if (base10NegRe.test(token)) value = parseInt(token, 10);
			else if (base16NegRe.test(token)) value = parseInt(token, 16);
			else if (base8NegRe.test(token)) value = parseInt(token, 8);
			else throw illegal(token, name || "integer");
			return value || 0;
		}
		function parseId(token, acceptNegative, max) {
			switch (token) {
				case "max":
				case "MAX":
				case "Max": return max || maxFieldId;
			}
			return parseInteger(token, acceptNegative, "id");
		}
		function parsePackage() {
			/* istanbul ignore if */
			if (pkg !== void 0) throw illegal("package");
			pkg = next();
			/* istanbul ignore if */
			if (pkg === null || !typeRefRe.test(pkg)) throw illegal(pkg, "name");
			ptr = ptr.define(pkg);
			skip(";");
		}
		function parseImport() {
			var token = peek();
			var whichImports;
			switch (token) {
				case "option":
					if (edition < "2024") throw illegal("option");
					next();
					readString();
					skip(";");
					return;
				case "weak":
					whichImports = weakImports || (weakImports = []);
					next();
					break;
				case "public": next();
				default: whichImports = imports || (imports = []);
			}
			token = readString();
			skip(";");
			whichImports.push(token);
		}
		function parseSyntax() {
			skip("=");
			edition = readString();
			/* istanbul ignore if */
			if (edition < 2023) throw illegal(edition, "syntax");
			skip(";");
		}
		function parseEdition() {
			skip("=");
			edition = readString();
			/* istanbul ignore if */
			if (!["2023", "2024"].includes(edition)) throw illegal(edition, "edition");
			skip(";");
		}
		function parseCommon(parent, token, depth) {
			if (depth === void 0) depth = 0;
			switch (token) {
				case "option":
					parseOption(parent, token);
					skip(";");
					return true;
				case "message":
					parseType(parent, token, depth + 1);
					return true;
				case "enum":
					parseEnum(parent, token);
					return true;
				case "export":
				case "local":
					if (edition < "2024") return false;
					token = next();
					if (token === "export" || token === "local") return false;
					if (token !== "message" && token !== "enum") return false;
					return parseCommon(parent, token, depth);
				case "service":
					parseService(parent, token, depth + 1);
					return true;
				case "extend":
					parseExtension(parent, token, depth);
					return true;
			}
			return false;
		}
		function ifBlock(obj, fnIf, fnElse) {
			var trailingLine = tn.line;
			if (obj) {
				if (typeof obj.comment !== "string") obj.comment = cmnt();
				obj.filename = parse.filename;
			}
			if (skip("{", true)) {
				var token;
				while ((token = next()) !== "}") fnIf(token);
				skip(";", true);
			} else {
				if (fnElse) fnElse();
				skip(";");
				if (obj && (typeof obj.comment !== "string" || preferTrailingComment)) obj.comment = cmnt(trailingLine) || obj.comment;
			}
		}
		function parseType(parent, token, depth) {
			if (depth === void 0) depth = 0;
			if (depth > util.nestingLimit) throw Error("max depth exceeded");
			/* istanbul ignore if */
			if ((token = next()) === null || !nameRe.test(token)) throw illegal(token, "type name");
			var type = new Type(token);
			ifBlock(type, function parseType_block(token) {
				if (parseCommon(type, token, depth)) return;
				switch (token) {
					case ";": break;
					case "map":
						parseMapField(type, token);
						break;
					case "required": if (edition !== "proto2") throw illegal(token);
					case "repeated":
						parseField(type, token, void 0, depth + 1);
						break;
					case "optional":
						/* istanbul ignore if */
						if (edition === "proto3") parseField(type, "proto3_optional", void 0, depth + 1);
						else if (edition !== "proto2") throw illegal(token);
						else parseField(type, "optional", void 0, depth + 1);
						break;
					case "oneof":
						parseOneOf(type, token, depth + 1);
						break;
					case "extensions":
						readRanges(type.extensions || (type.extensions = []));
						break;
					case "reserved":
						readRanges(type.reserved || (type.reserved = []), true);
						break;
					default:
						/* istanbul ignore if */
						if (edition === "proto2" || !typeRefRe.test(token)) throw illegal(token);
						push(token);
						parseField(type, "optional", void 0, depth + 1);
				}
			});
			parent.add(type);
			if (parent === ptr) topLevelObjects.push(type);
		}
		function parseField(parent, rule, extend, depth) {
			var type = next();
			if (type === null) throw illegal(type, "end of input");
			if (type === "group") {
				parseGroup(parent, rule, extend, depth);
				return;
			}
			while (type.endsWith(".") || (peek() || "").startsWith(".")) {
				var part = next();
				if (part === null) throw illegal(part, "end of input");
				type += part;
			}
			/* istanbul ignore if */
			if (!typeRefRe.test(type)) throw illegal(type, "type");
			var name = next();
			if (name === null) throw illegal(name, "end of input");
			/* istanbul ignore if */
			if (!nameRe.test(name)) throw illegal(name, "name");
			var protoName = name;
			name = applyCase(name);
			skip("=");
			var field = new Field(name, parseId(next()), type, rule === "proto3_optional" ? "optional" : rule, extend);
			if (protoName !== name) field.protoName = protoName;
			ifBlock(field, function parseField_block(token) {
				/* istanbul ignore else */
				if (token === "option") {
					parseOption(field, token);
					skip(";");
				} else throw illegal(token);
			}, function parseField_line() {
				parseInlineOptions(field);
			});
			if (rule === "proto3_optional") {
				var oneof = new OneOf("_" + name);
				field.setOption("proto3_optional", true);
				oneof.add(field);
				parent.add(oneof);
			} else parent.add(field);
			if (parent === ptr) topLevelObjects.push(field);
		}
		function parseGroup(parent, rule, extend, depth) {
			if (depth === void 0) depth = 0;
			if (depth > util.nestingLimit) throw Error("max depth exceeded");
			if (edition >= 2023) throw illegal("group");
			var name = next();
			/* istanbul ignore if */
			if (name === null || !nameRe.test(name)) throw illegal(name, "name");
			var fieldName = util.lcFirst(name);
			if (name === fieldName) name = util.ucFirst(name);
			skip("=");
			var id = parseId(next());
			var type = new Type(name);
			type.group = true;
			var field = new Field(fieldName, id, name, rule, extend);
			field.filename = parse.filename;
			ifBlock(type, function parseGroup_block(token) {
				switch (token) {
					case ";": break;
					case "map":
						parseMapField(type);
						break;
					case "option":
						parseOption(type, token);
						skip(";");
						break;
					case "required":
					case "repeated":
						parseField(type, token, void 0, depth + 1);
						break;
					case "optional":
						/* istanbul ignore if */
						if (edition === "proto3") parseField(type, "proto3_optional", void 0, depth + 1);
						else parseField(type, "optional", void 0, depth + 1);
						break;
					case "message":
						parseType(type, token, depth + 1);
						break;
					case "enum":
						parseEnum(type, token);
						break;
					case "reserved":
						readRanges(type.reserved || (type.reserved = []), true);
						break;
					case "export":
					case "local":
						if (edition < "2024") throw illegal(token);
						token = next();
						switch (token) {
							case "message":
								parseType(type, token, depth + 1);
								break;
							case "enum":
								parseType(type, token, depth + 1);
								break;
							default: throw illegal(token);
						}
						break;
					/* istanbul ignore next */
					default: throw illegal(token);
				}
			});
			parent.add(type).add(field);
			if (parent === ptr) {
				topLevelObjects.push(type);
				topLevelObjects.push(field);
			}
		}
		function parseMapField(parent) {
			skip("<");
			var keyType = next();
			/* istanbul ignore if */
			if (types.mapKey[keyType] === void 0) throw illegal(keyType, "type");
			skip(",");
			var valueType = next();
			/* istanbul ignore if */
			if (!typeRefRe.test(valueType)) throw illegal(valueType, "type");
			skip(">");
			var name = next();
			/* istanbul ignore if */
			if (name === null || !nameRe.test(name)) throw illegal(name, "name");
			skip("=");
			var protoName = name;
			name = applyCase(name);
			var field = new MapField(name, parseId(next()), keyType, valueType);
			if (protoName !== name) field.protoName = protoName;
			ifBlock(field, function parseMapField_block(token) {
				/* istanbul ignore else */
				if (token === "option") {
					parseOption(field, token);
					skip(";");
				} else throw illegal(token);
			}, function parseMapField_line() {
				parseInlineOptions(field);
			});
			parent.add(field);
		}
		function parseOneOf(parent, token, depth) {
			/* istanbul ignore if */
			if ((token = next()) === null || !nameRe.test(token)) throw illegal(token, "name");
			var oneof = new OneOf(applyCase(token));
			ifBlock(oneof, function parseOneOf_block(token) {
				if (token === "option") {
					parseOption(oneof, token);
					skip(";");
				} else {
					push(token);
					parseField(oneof, "optional", void 0, depth);
				}
			});
			parent.add(oneof);
		}
		function parseEnum(parent, token) {
			/* istanbul ignore if */
			if ((token = next()) === null || !nameRe.test(token)) throw illegal(token, "name");
			var enm = new Enum(token), values = [];
			ifBlock(enm, function parseEnum_block(token) {
				switch (token) {
					case ";": break;
					case "option":
						parseOption(enm, token);
						skip(";");
						break;
					case "reserved":
						readRanges(enm.reserved || (enm.reserved = []), true, maxEnumId, true);
						if (enm.reserved === void 0) enm.reserved = [];
						break;
					default: values.push(parseEnumValue(token));
				}
			});
			for (var i = 0; i < values.length; ++i) enm.add(values[i].name, values[i].id, values[i].comment, values[i].options);
			parent.add(enm);
			if (parent === ptr) topLevelObjects.push(enm);
		}
		function parseEnumValue(token) {
			/* istanbul ignore if */
			if (!nameRe.test(token)) throw illegal(token, "name");
			skip("=");
			var value = parseId(next(), true), dummy = { options: void 0 };
			dummy.getOption = function(name) {
				return this.options[name];
			};
			dummy.setOption = function(name, value) {
				ReflectionObject.prototype.setOption.call(dummy, name, value);
			};
			dummy.setParsedOption = function() {};
			ifBlock(dummy, function parseEnumValue_block(token) {
				/* istanbul ignore else */
				if (token === "option") {
					parseOption(dummy, token);
					skip(";");
				} else throw illegal(token);
			}, function parseEnumValue_line() {
				parseInlineOptions(dummy);
			});
			return {
				name: token,
				id: value,
				comment: dummy.comment,
				options: dummy.parsedOptions || dummy.options
			};
		}
		function parseOption(parent, token) {
			var option;
			var propName;
			var isOption = true;
			if (token === "option") token = next();
			while (token !== "=") {
				if (token === null) throw illegal(token, "end of input");
				if (token === "(") {
					var parensValue = next();
					skip(")");
					token = "(" + parensValue + ")";
				}
				if (isOption) {
					isOption = false;
					if (token.includes(".") && !token.includes("(")) {
						var tokens = token.split(".");
						option = tokens[0] + ".";
						token = tokens[1];
						continue;
					}
					option = token;
				} else propName = propName ? propName += token : token;
				token = next();
			}
			var optionValue = parseOptionValue(parent, propName ? option.concat(propName) : option);
			propName = propName && propName[0] === "." ? propName.slice(1) : propName;
			option = option && option[option.length - 1] === "." ? option.slice(0, -1) : option;
			setParsedOption(parent, option, optionValue, propName);
		}
		function parseOptionValue(parent, name, depth) {
			if (depth === void 0) depth = 0;
			if (depth > util.recursionLimit) throw Error("max depth exceeded");
			if (skip("{", true)) {
				var objectResult = {};
				while (!skip("}", true)) {
					token = next();
					var propName;
					if (token === null) throw illegal(token, "end of input");
					if (token === "[") {
						token = next();
						var slash = token === null ? -1 : token.lastIndexOf("/");
						if (token === null || !typeRefRe.test(slash < 0 ? token : token.slice(slash + 1))) throw illegal(token, "name");
						propName = "[" + token + "]";
						skip("]");
					} else {
						/* istanbul ignore if */
						if (!nameRe.test(token)) throw illegal(token, "name");
						propName = token;
					}
					var value;
					skip(":", true);
					if (peek() === "{") value = parseOptionValue(parent, name + "." + propName, depth + 1);
					else if (peek() === "[") {
						value = [];
						var lastValue, lastValueIsAggregate;
						if (skip("[", true)) {
							if (!skip("]", true)) {
								do {
									lastValueIsAggregate = peek() === "{";
									lastValue = lastValueIsAggregate ? parseOptionValue(parent, name + "." + propName, depth + 1) : readValue(true);
									value.push(lastValue);
								} while (skip(",", true));
								skip("]");
								if (typeof lastValue !== "undefined") {
									if (!lastValueIsAggregate) setOption(parent, name + "." + propName, lastValue);
								}
							}
						}
					} else {
						value = readValue(true);
						setOption(parent, name + "." + propName, value);
					}
					var prevValue = Object.prototype.hasOwnProperty.call(objectResult, propName) ? objectResult[propName] : void 0;
					if (prevValue) value = [].concat(prevValue).concat(value);
					if (propName !== "__proto__") objectResult[propName] = value;
					skip(",", true);
					skip(";", true);
				}
				return objectResult;
			}
			var simpleValue = name === "default" && parent instanceof Field && integerTypeRe.test(parent.type) ? parseInteger(next(), !unsignedTypeRe.test(parent.type)) : readValue(true);
			setOption(parent, name, simpleValue);
			return simpleValue;
		}
		function setOption(parent, name, value) {
			if (ptr === parent && /^features\./.test(name)) {
				topLevelOptions[name] = value;
				return;
			}
			if (name === "json_name" && parent instanceof Field) parent.jsonName = value;
			if (parent.setOption) parent.setOption(name, value);
		}
		function setParsedOption(parent, name, value, propName) {
			if (parent.setParsedOption) parent.setParsedOption(name, value, propName);
		}
		function parseInlineOptions(parent) {
			if (skip("[", true)) {
				do
					parseOption(parent, "option");
				while (skip(",", true));
				skip("]");
			}
			return parent;
		}
		function parseService(parent, token, depth) {
			if (depth === void 0) depth = 0;
			if (depth > util.recursionLimit) throw Error("max depth exceeded");
			/* istanbul ignore if */
			if ((token = next()) === null || !nameRe.test(token)) throw illegal(token, "service name");
			var service = new Service(token);
			ifBlock(service, function parseService_block(token) {
				if (parseCommon(service, token, depth)) return;
				/* istanbul ignore else */
				if (token === ";") return;
				if (token === "rpc") parseMethod(service, token);
				else throw illegal(token);
			});
			parent.add(service);
			if (parent === ptr) topLevelObjects.push(service);
		}
		function parseMethod(parent, token) {
			var commentText = cmnt();
			var type = token;
			/* istanbul ignore if */
			if (!nameRe.test(token = next())) throw illegal(token, "name");
			var name = token, requestType, requestStream, responseType, responseStream;
			skip("(");
			if (skip("stream", true)) requestStream = true;
			/* istanbul ignore if */
			if (!typeRefRe.test(token = next())) throw illegal(token);
			requestType = token;
			skip(")");
			skip("returns");
			skip("(");
			if (skip("stream", true)) responseStream = true;
			/* istanbul ignore if */
			if (!typeRefRe.test(token = next())) throw illegal(token);
			responseType = token;
			skip(")");
			var method = new Method(name, type, requestType, responseType, requestStream, responseStream);
			method.comment = commentText;
			ifBlock(method, function parseMethod_block(token) {
				/* istanbul ignore else */
				if (token === ";") return;
				if (token === "option") {
					parseOption(method, token);
					skip(";");
				} else throw illegal(token);
			});
			parent.add(method);
		}
		function parseExtension(parent, token, depth) {
			/* istanbul ignore if */
			if ((token = next()) === null || !typeRefRe.test(token)) throw illegal(token, "reference");
			var reference = token;
			ifBlock(null, function parseExtension_block(token) {
				switch (token) {
					case "required":
					case "repeated":
						parseField(parent, token, reference, depth + 1);
						break;
					case "optional":
						/* istanbul ignore if */
						if (edition === "proto3") parseField(parent, "proto3_optional", reference, depth + 1);
						else parseField(parent, "optional", reference, depth + 1);
						break;
					default:
						/* istanbul ignore if */
						if (edition === "proto2" || !typeRefRe.test(token)) throw illegal(token);
						push(token);
						parseField(parent, "optional", reference, depth + 1);
				}
			});
		}
		var token;
		while ((token = next()) !== null) switch (token) {
			case ";": break;
			case "package":
				/* istanbul ignore if */
				if (!head) throw illegal(token);
				parsePackage();
				break;
			case "import":
				parseImport();
				break;
			case "syntax":
				/* istanbul ignore if */
				if (!head) throw illegal(token);
				parseSyntax();
				break;
			case "edition":
				/* istanbul ignore if */
				if (!head) throw illegal(token);
				parseEdition();
				break;
			case "option":
				parseOption(ptr, token);
				skip(";", true);
				break;
			default:
				/* istanbul ignore else */
				if (parseCommon(ptr, token, 0)) {
					head = false;
					continue;
				}
				/* istanbul ignore next */
				throw illegal(token);
		}
		resolveFileFeatures();
		parse.filename = null;
		return {
			"package": pkg,
			"imports": imports,
			weakImports,
			root
		};
	}
}));
/**
* Parses the given .proto source and returns an object with the parsed contents.
* @name parse
* @function
* @param {string} source Source contents
* @param {IParseOptions} [options] Parse options. Defaults to {@link parse.defaults} when omitted.
* @returns {IParserResult} Parser result
* @property {string} filename=null Currently processing file name for error reporting, if known
* @property {IParseOptions} defaults Default {@link IParseOptions}
* @variation 2
*/
//#endregion
//#region node_modules/protobufjs/src/common.js
var require_common = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = common;
	var commonRe = /\/|\./;
	/**
	* Provides common type definitions.
	* Can also be used to provide additional google types or your own custom types.
	* @param {string} name Short name as in `google/protobuf/[name].proto` or full file name
	* @param {Object.<string,*>} json JSON definition within `google.protobuf` if a short name, otherwise the file's root definition
	* @returns {undefined}
	* @property {INamespace} google/protobuf/any.proto Any
	* @property {INamespace} google/protobuf/duration.proto Duration
	* @property {INamespace} google/protobuf/empty.proto Empty
	* @property {INamespace} google/protobuf/field_mask.proto FieldMask
	* @property {INamespace} google/protobuf/struct.proto Struct, Value, NullValue and ListValue
	* @property {INamespace} google/protobuf/timestamp.proto Timestamp
	* @property {INamespace} google/protobuf/wrappers.proto Wrappers
	* @example
	* // manually provides descriptor.proto (assumes google/protobuf/ namespace and .proto extension)
	* protobuf.common("descriptor", descriptorJson);
	*
	* // manually provides a custom definition (uses my.foo namespace)
	* protobuf.common("my/foo/bar.proto", myFooBarJson);
	*/
	function common(name, json) {
		if (!commonRe.test(name)) {
			name = "google/protobuf/" + name + ".proto";
			json = { nested: { google: { nested: { protobuf: { nested: json } } } } };
		}
		common[name] = json;
	}
	common("any", { 
	/**
	* Properties of a google.protobuf.Any message.
	* @interface IAny
	* @type {Object}
	* @property {string} [typeUrl]
	* @property {Uint8Array} [bytes]
	* @memberof common
	*/
Any: { fields: {
		type_url: {
			type: "string",
			id: 1
		},
		value: {
			type: "bytes",
			id: 2
		}
	} } });
	var timeType;
	common("duration", { 
	/**
	* Properties of a google.protobuf.Duration message.
	* @interface IDuration
	* @type {Object}
	* @property {number|Long} [seconds]
	* @property {number} [nanos]
	* @memberof common
	*/
Duration: timeType = { fields: {
		seconds: {
			type: "int64",
			id: 1
		},
		nanos: {
			type: "int32",
			id: 2
		}
	} } });
	common("timestamp", { 
	/**
	* Properties of a google.protobuf.Timestamp message.
	* @interface ITimestamp
	* @type {Object}
	* @property {number|Long} [seconds]
	* @property {number} [nanos]
	* @memberof common
	*/
Timestamp: timeType });
	common("empty", { 
	/**
	* Properties of a google.protobuf.Empty message.
	* @interface IEmpty
	* @memberof common
	*/
Empty: { fields: {} } });
	common("struct", {
		/**
		* Properties of a google.protobuf.Struct message.
		* @interface IStruct
		* @type {Object}
		* @property {Object.<string,IValue>} [fields]
		* @memberof common
		*/
		Struct: { fields: { fields: {
			keyType: "string",
			type: "Value",
			id: 1
		} } },
		/**
		* Properties of a google.protobuf.Value message.
		* @interface IValue
		* @type {Object}
		* @property {string} [kind]
		* @property {0} [nullValue]
		* @property {number} [numberValue]
		* @property {string} [stringValue]
		* @property {boolean} [boolValue]
		* @property {IStruct} [structValue]
		* @property {IListValue} [listValue]
		* @memberof common
		*/
		Value: {
			oneofs: { kind: { oneof: [
				"nullValue",
				"numberValue",
				"stringValue",
				"boolValue",
				"structValue",
				"listValue"
			] } },
			fields: {
				nullValue: {
					type: "NullValue",
					id: 1,
					protoName: "null_value"
				},
				numberValue: {
					type: "double",
					id: 2,
					protoName: "number_value"
				},
				stringValue: {
					type: "string",
					id: 3,
					protoName: "string_value"
				},
				boolValue: {
					type: "bool",
					id: 4,
					protoName: "bool_value"
				},
				structValue: {
					type: "Struct",
					id: 5,
					protoName: "struct_value"
				},
				listValue: {
					type: "ListValue",
					id: 6,
					protoName: "list_value"
				}
			}
		},
		NullValue: { values: { NULL_VALUE: 0 } },
		/**
		* Properties of a google.protobuf.ListValue message.
		* @interface IListValue
		* @type {Object}
		* @property {Array.<IValue>} [values]
		* @memberof common
		*/
		ListValue: { fields: { values: {
			rule: "repeated",
			type: "Value",
			id: 1
		} } }
	});
	common("wrappers", {
		/**
		* Properties of a google.protobuf.DoubleValue message.
		* @interface IDoubleValue
		* @type {Object}
		* @property {number} [value]
		* @memberof common
		*/
		DoubleValue: { fields: { value: {
			type: "double",
			id: 1
		} } },
		/**
		* Properties of a google.protobuf.FloatValue message.
		* @interface IFloatValue
		* @type {Object}
		* @property {number} [value]
		* @memberof common
		*/
		FloatValue: { fields: { value: {
			type: "float",
			id: 1
		} } },
		/**
		* Properties of a google.protobuf.Int64Value message.
		* @interface IInt64Value
		* @type {Object}
		* @property {number|Long} [value]
		* @memberof common
		*/
		Int64Value: { fields: { value: {
			type: "int64",
			id: 1
		} } },
		/**
		* Properties of a google.protobuf.UInt64Value message.
		* @interface IUInt64Value
		* @type {Object}
		* @property {number|Long} [value]
		* @memberof common
		*/
		UInt64Value: { fields: { value: {
			type: "uint64",
			id: 1
		} } },
		/**
		* Properties of a google.protobuf.Int32Value message.
		* @interface IInt32Value
		* @type {Object}
		* @property {number} [value]
		* @memberof common
		*/
		Int32Value: { fields: { value: {
			type: "int32",
			id: 1
		} } },
		/**
		* Properties of a google.protobuf.UInt32Value message.
		* @interface IUInt32Value
		* @type {Object}
		* @property {number} [value]
		* @memberof common
		*/
		UInt32Value: { fields: { value: {
			type: "uint32",
			id: 1
		} } },
		/**
		* Properties of a google.protobuf.BoolValue message.
		* @interface IBoolValue
		* @type {Object}
		* @property {boolean} [value]
		* @memberof common
		*/
		BoolValue: { fields: { value: {
			type: "bool",
			id: 1
		} } },
		/**
		* Properties of a google.protobuf.StringValue message.
		* @interface IStringValue
		* @type {Object}
		* @property {string} [value]
		* @memberof common
		*/
		StringValue: { fields: { value: {
			type: "string",
			id: 1
		} } },
		/**
		* Properties of a google.protobuf.BytesValue message.
		* @interface IBytesValue
		* @type {Object}
		* @property {Uint8Array} [value]
		* @memberof common
		*/
		BytesValue: { fields: { value: {
			type: "bytes",
			id: 1
		} } }
	});
	common("field_mask", { 
	/**
	* Properties of a google.protobuf.FieldMask message.
	* @interface IFieldMask
	* @type {Object}
	* @property {string[]} [paths]
	* @memberof common
	*/
FieldMask: { fields: { paths: {
		rule: "repeated",
		type: "string",
		id: 1
	} } } });
	/**
	* Gets the root definition of the specified common proto file.
	*
	* Bundled definitions are:
	* - google/protobuf/any.proto
	* - google/protobuf/duration.proto
	* - google/protobuf/empty.proto
	* - google/protobuf/field_mask.proto
	* - google/protobuf/struct.proto
	* - google/protobuf/timestamp.proto
	* - google/protobuf/wrappers.proto
	*
	* @param {string} file Proto file name
	* @returns {INamespace|null} Root definition or `null` if not defined
	*/
	common.get = function get(file) {
		return common[file] || null;
	};
}));
//#endregion
//#region node_modules/protobufjs/src/index.js
var require_src = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	exports = module.exports = require_index_light();
	exports.build = "full";
	exports.tokenize = require_tokenize();
	exports.parse = require_parse();
	exports.common = require_common();
	exports.Root._configure(exports.Type, exports.parse, exports.common);
}));
//#endregion
//#region commons/GameMode.ts
var import_protobufjs = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_src();
})))(), 1);
var _loggerGenerator = (name, level) => ({
	debug(text) {},
	info(text) {},
	warning(text) {},
	error(text) {}
});
var GameMode = class GameMode {
	static MAX_DT = .02;
	static getLogger(name, level = "info") {
		return _loggerGenerator(name, level);
	}
	quickEmulate(duration, produceFinish = false) {
		while (duration > GameMode.MAX_DT) {
			const f = this.run(GameMode.MAX_DT, produceFinish);
			if (f && produceFinish) return f;
			duration -= GameMode.MAX_DT;
		}
		return this.run(duration, produceFinish);
	}
	/**
	* Emulates the game from a starting time to a finish time while applying
	* the given inputs at their respective timestamps.
	*
	* @param start The simulation start time, in milliseconds.
	* @param finish The simulation finish time, or a function that computes
	*               time after all inputs have been processed.
	* @param inputs The inputs to apply during the simulation.
	* @param preprocess Optional function used to create inputs that are
	*                   executed immediately at the given timestamp.
	*                   The returned inputs timestamp is ignored.
	* @param finishGame Handle game finish (if no present, Finish data will be ignored)
	* @returns The final simulation time.
	*/
	emulate(start, finish, inputs, preprocess, finishGame) {
		let currentTime = start;
		const finishLimit = typeof finish === "function" ? Infinity : finish;
		for (const input of inputs) {
			const inputTimestamp = input.timestamp;
			if (inputTimestamp > finishLimit) break;
			if (inputTimestamp < currentTime) continue;
			const duration = (inputTimestamp - currentTime) / 1e3;
			if (preprocess) for (const i of preprocess(currentTime)) this.runInput(i.player, i);
			const f = this.quickEmulate(duration, finishGame ? true : false);
			if (f && finishGame) {
				finishGame(f);
				return inputTimestamp;
			}
			this.runInput(input.player, input);
			currentTime = inputTimestamp;
		}
		if (typeof finish === "function") finish = finish();
		const duration = (finish - currentTime) / 1e3;
		if (preprocess) for (const i of preprocess(currentTime)) this.runInput(i.player, i);
		const f = this.quickEmulate(duration, finishGame ? true : false);
		if (f && finishGame) finishGame(f);
		return finish;
	}
};
//#endregion
//#region commons/util/collisions.ts
var collisions;
(function(_collisions) {
	function RectCircle(rect, circle) {
		const distX = Math.abs(circle.x - rect.x);
		const distY = Math.abs(circle.y - rect.y);
		if (distX > rect.w / 2 + circle.r) return false;
		if (distY > rect.h / 2 + circle.r) return false;
		if (distX <= rect.w / 2) return true;
		if (distY <= rect.h / 2) return true;
		const dx = distX - rect.w / 2;
		const dy = distY - rect.h / 2;
		return dx * dx + dy * dy <= circle.r * circle.r;
	}
	_collisions.RectCircle = RectCircle;
	function RectRect(a, b) {
		const dx = Math.abs(a.x - b.x);
		const dy = Math.abs(a.y - b.y);
		return dx <= (a.w + b.w) / 2 && dy <= (a.h + b.h) / 2;
	}
	_collisions.RectRect = RectRect;
	function CircleCircle(a, b) {
		const dx = a.x - b.x;
		const dy = a.y - b.y;
		const distSq = dx * dx + dy * dy;
		const radiusSum = a.r + b.r;
		return distSq <= radiusSum * radiusSum;
	}
	_collisions.CircleCircle = CircleCircle;
})(collisions || (collisions = {}));
//#endregion
//#region commons/util/decodeFullMessage.ts
function decodeFullMessage(message) {
	const result = {};
	for (const [name] of Object.entries(message.$type.fields)) {
		const value = message[name];
		if (value === void 0 || value === null) continue;
		if (Array.isArray(value)) result[name] = value.map((v) => isMessage(v) ? decodeFullMessage(v) : v);
		else if (isMessage(value)) result[name] = decodeFullMessage(value);
		else result[name] = value;
	}
	for (const [name] of Object.entries(message.$type.oneofs ?? {})) result[name] = message[name];
	return result;
}
function isMessage(value) {
	return typeof value === "object" && value !== null && "$type" in value && value.$type instanceof import_protobufjs.Type;
}
//#endregion
//#region commons/gamemods/getImageRootPath.ts
function getImageRootPath() {
	return window.IMG_ROOT_PATH;
}
//#endregion
//#region commons/gamemods/GMAirBasket.ts
var protocols$3 = getProtocol("airbasket", "multiplayer");
var GRAVITY$1 = 1100;
var WIDTH$2 = 2400;
var HEIGHT$2 = 1350;
var X_LIMIT = WIDTH$2 * 2.5;
var Y_LIMIT = HEIGHT$2 * 1.5;
var TIMES = [
	180,
	60,
	120
];
var COLORS = [
	[
		"#ff4f99",
		"#ff9b7a",
		"#ffffff",
		"#7199ff",
		"#4f99ff"
	],
	[
		"#ff0770",
		"#ff7744",
		"#cccccc",
		"#4477ff",
		"#0077ff"
	],
	[
		"#cc0059",
		"#cc5f36",
		"#999999",
		"#365fcc",
		"#005fcc"
	]
];
var BUCKET_POSITIONS = [
	[-2, -1],
	[-1, -1],
	[0, -1],
	[1, -1],
	[2, -1],
	[-2, 0],
	[-1, 0],
	[1, 0],
	[2, 0],
	[-2, 1],
	[-1, 1],
	[-.25, 1],
	[.25, 1],
	[1, 1],
	[2, 1]
];
var MINIMAP_X$1 = WIDTH$2 * .79;
var MINIMAP_Y$1 = HEIGHT$2 * .01;
var MINIMAP_RATIO$1 = .2;
var Ball = class Ball {
	static RADIUS = 70;
	static SPAWN_JUMP = 20;
	static GRAVITY = 500;
	static EJECT = 1200;
	x = 0;
	y = 0;
	vx = 0;
	vy = -Ball.SPAWN_JUMP;
	grabber = -1;
	prevGrabber = -1;
	move(dt) {
		if (this.grabber >= 0) return;
		this.vy += Ball.GRAVITY * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		if (this.isOOB()) this.reset();
	}
	reset() {
		this.x = 0;
		this.y = 0;
		this.vx = 0;
		this.vy = -Ball.SPAWN_JUMP;
		this.prevGrabber = -1;
		this.removeGrabber();
	}
	load(obj) {
		if (obj.ball === "freeBall") {
			this.x = obj.freeBall.x;
			this.y = obj.freeBall.y;
			this.vx = obj.freeBall.vx;
			this.vy = obj.freeBall.vy;
			this.grabber = -1;
		} else this.grabber = obj.grabbedBall.owner;
		this.prevGrabber = obj.prevBallGrabber;
	}
	isOOB() {
		return this.x < -6e3 + Ball.RADIUS / 2 || this.x > X_LIMIT - Ball.RADIUS / 2 || this.y < -2025 + Ball.RADIUS / 2 || this.y > Y_LIMIT - Ball.RADIUS / 2;
	}
	removeGrabber() {
		if (this.grabber < 0) return;
		this.prevGrabber = this.grabber;
		this.grabber = -1;
	}
	eject() {
		this.removeGrabber();
		if (this.y <= -1350) this.vy = 0;
		else this.vy = -Ball.EJECT;
		if (this.x < -2400) this.vx = Ball.EJECT;
		if (this.x > WIDTH$2) this.vx = -Ball.EJECT;
		if (this.x > X_LIMIT - Ball.RADIUS / 2) this.x = X_LIMIT - Ball.RADIUS / 2;
		else if (this.x < -6e3 + Ball.RADIUS / 2) this.x = -6e3 + Ball.RADIUS / 2;
		if (this.y > Y_LIMIT - Ball.RADIUS / 2) this.y = Y_LIMIT - Ball.RADIUS / 2;
		else if (this.y < -2025 + Ball.RADIUS / 2) this.y = -2025 + Ball.RADIUS / 2;
	}
};
var Player$3 = class Player$3 {
	x;
	y;
	static GRAB_GRAVITY = 900;
	static SPEED = 1500;
	static ACCELERATION = 1e4;
	static MIN_DECELERATION = 1e3;
	static SOFT_DECELERATION = 1e4;
	static QUICK_DECELERATION = 3e4;
	static JUMP = 800;
	static SPAWN_JUMP = 90;
	static COOLDOWN = 1.5;
	static WIDTH = 40;
	static HEIGHT = 80;
	static PUSH_DOWN = 1e3;
	static THROW = 1200;
	static BOUNCE_X = 1e3;
	static BOUNCE_Y = 100;
	spawnX = null;
	spawnY = null;
	connected = true;
	alive = -1;
	vx = 0;
	vy = -Player$3.SPAWN_JUMP;
	dir = 0;
	pushDown = false;
	score = 0;
	target = null;
	team = "red";
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
	initSpawn(x, y, team) {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
		this.team = team;
	}
	isAlive() {
		return this.alive < 0;
	}
	move(dt, grabber) {
		if (this.alive >= 0) {
			this.alive -= dt;
			if (this.alive >= 0) return;
			if (this.spawnX !== null) this.x = this.spawnX;
			if (this.spawnY !== null) this.y = this.spawnY;
		}
		if (this.dir === 0) {
			if (this.vx > 0) {
				this.vx -= Player$3.SOFT_DECELERATION * dt;
				if (this.vx < 0) this.vx = 0;
			} else if (this.vx < 0) {
				this.vx += Player$3.SOFT_DECELERATION * dt;
				if (this.vx > 0) this.vx = 0;
			}
		} else if (this.dir > 0) {
			if (this.vx < 0) {
				this.vx += Player$3.QUICK_DECELERATION * dt;
				if (this.vx > 0) this.vx = 0;
			} else if (this.vx < Player$3.SPEED) {
				this.vx += Player$3.ACCELERATION * dt;
				if (this.vx > Player$3.SPEED) this.vx = Player$3.SPEED;
			} else if (this.vx > Player$3.SPEED) {
				this.vx -= Player$3.MIN_DECELERATION * dt;
				if (this.vx < Player$3.SPEED) this.vx = Player$3.SPAWN_JUMP;
			}
		} else if (this.vx > 0) {
			this.vx -= Player$3.QUICK_DECELERATION * dt;
			if (this.vx < 0) this.vx = 0;
		} else if (this.vx > -Player$3.SPEED) {
			this.vx -= Player$3.ACCELERATION * dt;
			if (this.vx < -Player$3.SPEED) this.vx = -Player$3.SPEED;
		} else if (this.vx < -Player$3.SPEED) {
			this.vx += Player$3.MIN_DECELERATION * dt;
			if (this.vx > -Player$3.SPEED) this.vx = -Player$3.SPAWN_JUMP;
		}
		this.vy += (grabber ? Player$3.GRAB_GRAVITY : GRAVITY$1) * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		if (this.pushDown) this.y += Player$3.PUSH_DOWN * dt;
		if (this.isOOB()) this.die();
	}
	touchsBall(ball) {
		return collisions.RectCircle({
			x: this.x,
			y: this.y,
			w: Player$3.WIDTH,
			h: Player$3.HEIGHT
		}, {
			x: ball.x,
			y: ball.y,
			r: Ball.RADIUS
		});
	}
	load(obj) {
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.dir = obj.dir;
		this.alive = obj.alive;
		this.score = obj.score;
		this.pushDown = obj.pushDown;
	}
	isOOB() {
		return this.x < -6e3 + Player$3.WIDTH / 2 || this.x > X_LIMIT - Player$3.WIDTH / 2 || this.y < -2025 + Player$3.HEIGHT / 2 || this.y > Y_LIMIT - Player$3.HEIGHT / 2;
	}
	die() {
		this.vx = 0;
		this.vy = -Player$3.SPAWN_JUMP;
		this.alive = Player$3.COOLDOWN;
	}
};
var Bucket = class {
	x;
	y;
	team = null;
	static SIZE = 110;
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
};
var Camera$1 = class Camera$1 {
	x = 0;
	y = 0;
	static SCALE = .8;
	static DURATION = .3;
	startX = 0;
	startY = 0;
	targetX = 0;
	targetY = 0;
	isTransitioning = false;
	t = 0;
	/**
	* Easing function: f([0;1]) -> [0;1]
	* Here we use a standard "Smoothstep" (ease-in-out) function as an example.
	*/
	easing(t) {
		const clampedT = Math.max(0, Math.min(1, t));
		return clampedT * clampedT * (3 - 2 * clampedT);
	}
	/**
	* Calculates the center coordinates of the zone the player is currently in.
	*/
	getZoneCenter(px, py) {
		let zx = Math.round(px / WIDTH$2);
		let zy = Math.round(py / HEIGHT$2);
		zx = Math.max(-2, Math.min(2, zx));
		zy = Math.max(-1, Math.min(1, zy));
		return {
			cx: zx * WIDTH$2,
			cy: zy * HEIGHT$2
		};
	}
	/**
	* Updates the camera position.
	* @param px Player X position
	* @param py Player Y position
	* @param dt Delta time (time elapsed since last frame, e.g., in milliseconds)
	*/
	update(px, py, dt) {
		const { cx, cy } = this.getZoneCenter(px, py);
		if (cx !== this.targetX || cy !== this.targetY) {
			this.startX = this.x;
			this.startY = this.y;
			this.targetX = cx;
			this.targetY = cy;
			this.t = 0;
			this.isTransitioning = true;
		}
		if (this.isTransitioning) {
			this.t += dt;
			if (this.t >= Camera$1.DURATION) {
				this.isTransitioning = false;
				this.x = this.targetX;
				this.y = this.targetY;
			} else {
				const progress = this.easing(this.t / Camera$1.DURATION);
				this.x = this.startX + (this.targetX - this.startX) * progress;
				this.y = this.startY + (this.targetY - this.startY) * progress;
			}
		} else {
			this.x = this.targetX;
			this.y = this.targetY;
		}
	}
	/**
	* Instantly moves the camera to the player's current zone, 
	* breaking any ongoing transition.
	*/
	teleport(px, py) {
		const { cx, cy } = this.getZoneCenter(px, py);
		this.x = cx;
		this.y = cy;
		this.targetX = cx;
		this.targetY = cy;
		this.isTransitioning = false;
		this.t = 0;
	}
	getCoords() {
		return {
			x: this.x,
			y: this.y
		};
	}
};
var ClientData$4 = class ClientData$4 {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;
	skins = [];
	html;
	time;
	period;
	redScore;
	blueScore;
	camera = new Camera$1();
	clientWasDead = true;
	lastDirs = {};
	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-airbasket-root");
		this.time = document.createElement("div");
		this.time.classList.add("game-airbasket-time");
		this.period = document.createElement("div");
		this.period.classList.add("game-airbasket-period");
		const scores = document.createElement("div");
		scores.classList.add("game-airbasket-scores");
		this.redScore = document.createElement("div"), this.blueScore = document.createElement("div"), this.redScore.classList.add("game-airbasket-red-score");
		this.blueScore.classList.add("game-airbasket-blue-score");
		const tiret = document.createElement("div");
		tiret.textContent = "-";
		scores.appendChild(this.redScore);
		scores.appendChild(tiret);
		scores.appendChild(this.blueScore);
		this.html.appendChild(scores);
		this.html.appendChild(this.time);
		this.html.appendChild(this.period);
	}
	static PERIODS = [
		"normal",
		"grabber infinite",
		"sudden death"
	];
	static showTime(time) {
		return `${Math.floor(time / 60)}:${(time % 60).toFixed(1).padStart(4, "0")}`;
	}
	update(game, playerIdx) {
		this.time.innerText = ClientData$4.showTime(game.time);
		this.period.innerText = ClientData$4.PERIODS[game.timeStep];
		this.redScore.innerText = String(game.redScore).padStart(2, "0");
		this.blueScore.innerText = String(game.blueScore).padStart(2, "0");
		const player = game.players[playerIdx];
		if (this.clientWasDead && player.alive < 0) this.camera.teleport(player.x, player.y);
		this.clientWasDead = player.alive >= 0;
		this.camera.update(player.x, player.y, 1 / 60);
	}
	getPlayerTextureCode(grabbing, player, idx) {
		let first;
		let second;
		let third;
		if (player.vy < -600) first = 1;
		else if (player.vy >= 0) first = 2;
		else first = 0;
		second = grabbing ? 1 : 0;
		if (player.dir === 0) {
			if (player.vx < 0) third = true;
			else if (player.vx > 0) third = false;
			else third = this.lastDirs[idx];
		} else third = player.dir < 0;
		this.lastDirs[idx] = third;
		return [
			first,
			second,
			third
		];
	}
};
var TutorialData$2 = class {
	game;
	step = 0;
	wakeUp = 0;
	constructor(game) {
		this.game = game;
	}
	frame(dt, clock) {
		const player = this.game.players[0];
		const bot = this.game.players[1];
		if (player.alive >= 0) this.step = 0;
		if (this.step === 0) {
			this.game.ball.x = 0;
			this.game.ball.y = 0;
			this.game.ball.vy = 0;
			this.game.ball.prevGrabber = -1;
			if (this.game.ball.grabber === 0) this.step = 2;
			if (player.x >= -1200 && player.x <= WIDTH$2 / 2 && player.y >= -675 && player.y <= HEIGHT$2 / 2) this.step = 1;
			return "Go towards the ball (jump to do not fall)";
		}
		if (this.step === 1) {
			if (this.game.ball.grabber === 0) this.step = 2;
			this.game.ball.prevGrabber = -1;
			return "Take the ball";
		}
		if (this.step === 2) {
			if (player.vy < 0) this.step = 3;
			return "";
		}
		if (this.step === 3) {
			if (this.game.ball.grabber !== -1) {
				this.step = 4;
				this.wakeUp = clock + 1.5;
			}
			return "You can't jump when holding the ball.\n Throw it with the mouse towards a mate or a GREEN bucket";
		}
		if (this.step === 4) {
			if (clock >= this.wakeUp) {
				bot.x = this.game.ball.x;
				bot.y = this.game.ball.y;
				bot.target = {
					type: "fixed",
					x: player.x,
					y: player.y
				};
				this.wakeUp = clock + 1;
				this.step = 5;
			}
			return "You can't re-take the ball after have having thrown it.\n An other player needs to take the ball";
		}
		if (this.step === 5) {
			if (clock >= this.wakeUp) this.step = 3;
			return "We spawned a bot to do that. Try to touch GREEN buckets";
		}
		return "";
	}
	lockGame() {
		return [3].includes(this.step);
	}
};
function generateClientDom$4(unlockedSkins) {
	return {
		skin: Object.keys(GMAirBasket.SKINS)[0],
		preferTeam: 0,
		SKINS: GMAirBasket.SKINS,
		unlockedSkins,
		produce() {
			const { StartData } = protocols$3.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		},
		hasSkin(skin) {
			return this.unlockedSkins.includes(skin);
		},
		getIconPath
	};
}
function lighten(hex, factor) {
	return `#${[
		1,
		3,
		5
	].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((c) => Math.round(c + (255 - c) / factor)).map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
/**
* Checks for AABB rectangle collisions between all players.
* If a collision is found, violently projects the players in opposite directions.
*/
function applyCollisions(players) {
	for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
		const p1 = players[i];
		const p2 = players[j];
		if (!p1.isAlive() || !p2.isAlive()) continue;
		const dx = p1.x - p2.x;
		const dy = p1.y - p2.y;
		if (Math.abs(dx) < Player$3.WIDTH && Math.abs(dy) < Player$3.HEIGHT) {
			const dist = Math.sqrt(dx * dx + dy * dy);
			let nx = 0;
			let ny = 0;
			if (dist === 0) {
				nx = 1;
				ny = 0;
			} else {
				nx = dx / dist;
				ny = dy / dist;
			}
			p1.vx += nx * Player$3.BOUNCE_X;
			p1.vy += ny * Player$3.BOUNCE_Y;
			p2.vx -= nx * Player$3.BOUNCE_X;
			p2.vy -= ny * Player$3.BOUNCE_Y;
		}
	}
}
function getVectorToReachTarget(X, Y, N, g) {
	if (X === 0) return {
		x: 0,
		y: Y > 0 ? N : -N,
		success: false
	};
	const X2 = X * X;
	const Y2 = Y * Y;
	const N2 = N * N;
	const g2 = g * g;
	const delta = X2 * (N2 * N2 + 2 * N2 * g * Y - g2 * X2);
	function fail() {
		const n = N / Math.sqrt(X2 + Y2);
		return {
			x: X * n,
			y: Y * n,
			success: false
		};
	}
	if (delta < 0) return fail();
	const a = X2 + Y2;
	const S = (-(-X2 * (N2 + g * Y)) + Math.sqrt(delta)) / (2 * a);
	if (S <= 0) return fail();
	const v0 = Math.sign(X) * Math.sqrt(S);
	return {
		x: v0,
		y: v0 / X * (Y - g * X2 / (2 * S)),
		success: true
	};
}
function drawPlayerToTarget(ctx, srcX, srcY, destX, destY, color) {
	const X = destX - srcX;
	const Y = destY - srcY;
	let radius;
	let lineWidth;
	let outline = false;
	if (color === true) {
		lineWidth = 5;
		ctx.strokeStyle = "black";
		color = "black";
		radius = 5;
	} else if (color === false) {
		lineWidth = 4;
		ctx.strokeStyle = "grey";
		color = "grey";
		radius = 4;
	} else {
		lineWidth = 10;
		ctx.strokeStyle = color;
		radius = 10;
		outline = true;
	}
	if (outline) {
		ctx.beginPath();
		ctx.arc(destX, destY, radius + 2, 0, Math.PI * 2);
		ctx.lineWidth = lineWidth + 4;
		ctx.strokeStyle = "black";
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(destX, destY, radius, 0, Math.PI * 2);
		ctx.lineWidth = lineWidth;
		ctx.strokeStyle = color;
		ctx.stroke();
	} else {
		ctx.beginPath();
		ctx.arc(destX, destY, radius, 0, Math.PI * 2);
		ctx.stroke();
	}
	const velocity = getVectorToReachTarget(X, Y, Player$3.THROW, Ball.GRAVITY);
	if (velocity.x === 0 || !velocity.success) {
		const dx = destX - srcX;
		const dy = destY - srcY;
		const distance = Math.sqrt(dx * dx + dy * dy);
		if (distance === 0) return;
		const startX = srcX + dx / distance * 40;
		const startY = srcY + dy / distance * 40;
		ctx.beginPath();
		ctx.moveTo(startX, startY);
		ctx.lineTo(destX, destY);
		if (outline) {
			ctx.lineWidth = lineWidth + 4;
			ctx.strokeStyle = "black";
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(startX, startY);
			ctx.lineTo(destX, destY);
			ctx.lineWidth = lineWidth;
			ctx.strokeStyle = color;
			ctx.stroke();
		} else ctx.stroke();
		return;
	}
	const vx = velocity.x;
	const vy = velocity.y;
	const g = Ball.GRAVITY;
	const T = X / vx;
	if (T <= 0) return;
	const steps = 50;
	const points = [];
	for (let i = 0; i <= steps; i++) {
		const t = T * i / steps;
		const x = srcX + vx * t;
		const y = srcY + vy * t + g / 2 * t * t;
		points.push({
			x,
			y
		});
	}
	let startIndex = 0;
	for (let i = 1; i < points.length; i++) {
		const dx = points[i].x - srcX;
		const dy = points[i].y - srcY;
		if (Math.sqrt(dx * dx + dy * dy) >= 40) {
			startIndex = i;
			break;
		}
	}
	const drawCurve = () => {
		ctx.beginPath();
		ctx.moveTo(points[startIndex].x, points[startIndex].y);
		for (let i = startIndex + 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
		ctx.stroke();
	};
	if (outline) {
		ctx.lineWidth = lineWidth + 4;
		ctx.strokeStyle = "black";
		drawCurve();
	}
	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color;
	drawCurve();
}
function getTexturePath(id) {
	return `${getImageRootPath()}/assets/games/airbasket/skins/${id}/grid.png`;
}
function getIconPath(id) {
	return `${getImageRootPath()}/assets/games/airbasket/skins/${id}/icon.png`;
}
var GMAirBasket = class GMAirBasket extends GameMode {
	static types = {
		Player: Player$3,
		Bucket
	};
	static DATA = {
		GRAVITY: GRAVITY$1,
		WIDTH: WIDTH$2,
		HEIGHT: HEIGHT$2,
		X_LIMIT,
		Y_LIMIT
	};
	players;
	ball = new Ball();
	buckets;
	redScore = 0;
	blueScore = 0;
	leftBuckets = BUCKET_POSITIONS.length;
	timeStep = 0;
	time = TIMES[0];
	finished = false;
	internalFrameTick = 0;
	constructor(total) {
		super();
		this.players = Array.from({ length: total }, () => new Player$3(0, 0));
		this.buckets = BUCKET_POSITIONS.map(([x, y]) => new Bucket(x * WIDTH$2, y * HEIGHT$2));
	}
	static async createServ(players, total, hasSkin) {
		const { StartData, StartDataClient } = protocols$3.get();
		const game = new GMAirBasket(total);
		function decode(i) {
			if (i < players.length) return decodeFullMessage(StartData.decode(players[i].data));
			return generateClientDom$4([]);
		}
		const playerInfos = await Promise.all(game.players.map(async (p, i) => {
			const d = decode(i);
			let skin;
			const pseudo = i < players.length ? players[i].pseudo : null;
			if (pseudo !== null && GMAirBasket.SKINS_IDS.includes(d.skin)) {
				if (await hasSkin("airbasket", d.skin, pseudo)) skin = d.skin;
				else skin = GMAirBasket.SKINS_IDS[0];
			} else skin = GMAirBasket.SKINS_IDS[0];
			return {
				player: p,
				index: i,
				skin,
				pref: d.preferTeam ?? 0
			};
		}));
		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);
		const assigned = new Array(totalPlayers);
		let redCount = 0;
		let blueCount = 0;
		for (let i = 0; i < totalPlayers; i++) {
			const info = playerInfos[i];
			if (info.pref === 1 && redCount < maxPerTeam) {
				assigned[info.index] = true;
				redCount++;
			} else if (info.pref === -1 && blueCount < maxPerTeam) {
				assigned[info.index] = false;
				blueCount++;
			}
		}
		for (let i = 0; i < totalPlayers; i++) {
			if (assigned[i] !== void 0) continue;
			if ((redCount < blueCount || redCount === blueCount && i % 2 === 0) && redCount < maxPerTeam) {
				assigned[i] = true;
				redCount++;
			} else {
				assigned[i] = false;
				blueCount++;
			}
		}
		for (const [i, p] of game.players.entries()) {
			const redTeam = assigned[i];
			p.initSpawn(redTeam ? -4800 : WIDTH$2 * 2, 0, redTeam ? "red" : "blue");
		}
		return {
			game,
			data: StartDataClient.encode({ players: game.players.map((p, idx) => ({
				x: p.spawnX,
				y: p.spawnY,
				skin: playerInfos[idx].skin,
				isRed: p.team === "red"
			})) }).finish()
		};
	}
	static createClient(data, total) {
		const game = new GMAirBasket(total);
		const { StartDataClient } = protocols$3.get();
		const clientData = new ClientData$4();
		let skins;
		if (data) {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
			const skinSet = /* @__PURE__ */ new Set();
			for (const [idx, p] of players.entries()) {
				game.players[idx].initSpawn(p.x, p.y, p.isRed ? "red" : "blue");
				clientData.skins.push(p.skin);
				skinSet.add(p.skin);
			}
			console.log(skinSet);
			skins = Object.fromEntries([...skinSet].map((key) => ["skin-" + key, getTexturePath(key)]));
		} else {
			game.players[0].initSpawn(-4800, 0, "red");
			game.players[1].initSpawn(4800, 0, "blue");
			clientData.skins = Array.from({ length: game.players.length }, () => GMAirBasket.SKINS_IDS[0]);
			skins = {};
		}
		return {
			game,
			data: clientData,
			html: clientData.html,
			skins
		};
	}
	static generateClientDom = generateClientDom$4;
	static SKINS = {
		joe: "Joe",
		luck: "Luck",
		kwanita: "Kwanita",
		nooby: "Nooby",
		willy: "Willy"
	};
	static SKINS_IDS = Object.keys(GMAirBasket.SKINS);
	static TEXTURES = {
		"ball": "/assets/games/airbasket/ball.png",
		"bucket-blue": "/assets/games/airbasket/bucket-blue.png",
		"bucket-mid": "/assets/games/airbasket/bucket-mid.png",
		"bucket-red": "/assets/games/airbasket/bucket-red.png",
		"sky": "/assets/games/airbasket/sky.png",
		"skin-joe": getTexturePath("joe")
	};
	init() {}
	getBotIds(count) {
		return Array.from({ length: count }, () => 0);
	}
	playerTouchBucket(player) {
		const rect = {
			x: player.x,
			y: player.y,
			w: Player$3.WIDTH,
			h: Player$3.HEIGHT
		};
		for (const bucket of this.buckets) {
			if (bucket.team !== null) continue;
			if (collisions.RectRect(rect, {
				x: bucket.x,
				y: bucket.y,
				w: Bucket.SIZE,
				h: Bucket.SIZE
			})) return bucket;
		}
		return null;
	}
	ballTouchBucket() {
		const circle = {
			x: this.ball.x,
			y: this.ball.y,
			r: Ball.RADIUS
		};
		for (const bucket of this.buckets) {
			if (bucket.team !== null) continue;
			if (collisions.RectCircle({
				x: bucket.x,
				y: bucket.y,
				w: Bucket.SIZE,
				h: Bucket.SIZE
			}, circle)) return bucket;
		}
		return null;
	}
	winPoint(playerIdx, bucket) {
		const player = this.players[playerIdx];
		player.score++;
		bucket.team = player.team;
		if (player.team === "red") this.redScore++;
		else this.blueScore++;
		this.leftBuckets--;
		this.ball.reset();
	}
	canRegrab() {
		return this.timeStep >= 1;
	}
	isSuddenDeath() {
		return this.timeStep >= 2;
	}
	run(dt, produceFinish) {
		this.time -= dt;
		if (this.time <= 0) {
			this.timeStep++;
			if (this.timeStep >= TIMES.length) {
				this.finished = true;
				this.time = Infinity;
			}
			this.time += TIMES[this.timeStep];
		}
		if (this.isSuddenDeath() && this.redScore !== this.blueScore) this.finished = true;
		for (const [idx, p] of this.players.entries()) p.move(dt, idx === this.ball.grabber);
		applyCollisions(this.players);
		if (this.ball.grabber >= 0) {
			const grabber = this.players[this.ball.grabber];
			if (!grabber.isAlive()) this.ball.eject();
			else if (grabber.target && grabber.target.type === "fixed") {
				const dx = grabber.target.x - grabber.x;
				const dy = grabber.target.y - grabber.y;
				if (dx !== 0 || dy !== 0) {
					const { x, y } = getVectorToReachTarget(dx, dy, Player$3.THROW, Ball.GRAVITY);
					this.ball.vx = x;
					this.ball.vy = y;
					this.ball.removeGrabber();
				}
			}
		}
		this.ball.move(dt);
		if (this.ball.grabber >= 0) {
			const grabber = this.players[this.ball.grabber];
			this.ball.x = grabber.x;
			this.ball.y = grabber.y;
		}
		if (this.ball.grabber < 0) {
			const canRegrab = this.canRegrab();
			let grabber = -1;
			for (const [i, p] of this.players.entries()) if ((canRegrab || i !== this.ball.prevGrabber) && p.touchsBall(this.ball)) {
				if (grabber >= 0) {
					grabber = -1;
					break;
				}
				grabber = i;
			}
			if (grabber >= 0) this.ball.grabber = grabber;
		}
		if (this.ball.grabber >= 0) {
			const bucket = this.playerTouchBucket(this.players[this.ball.grabber]);
			if (bucket) this.winPoint(this.ball.grabber, bucket);
		} else if (this.ball.prevGrabber >= 0) {
			const bucket = this.ballTouchBucket();
			if (bucket) this.winPoint(this.ball.prevGrabber, bucket);
		}
		if (produceFinish && this.finished) return this.produceFinish();
		return null;
	}
	runInput(playerIdx, input) {
		const player = this.players[playerIdx];
		switch (input.action) {
			case "right":
				player.dir = 1;
				break;
			case "left":
				player.dir = -1;
				break;
			case "stop":
				player.dir = 0;
				break;
			case "jump":
				if (this.ball.grabber !== playerIdx) player.vy = -Player$3.JUMP;
				break;
			case "downOn":
				player.pushDown = true;
				break;
			case "downOff":
				player.pushDown = false;
				break;
			case "throwTarget":
				player.target = {
					type: "fixed",
					x: input.throwTarget.x,
					y: input.throwTarget.y
				};
				break;
			case "throwDir":
				player.target = {
					type: "delta",
					dx: input.throwTarget.x,
					dy: input.throwTarget.y
				};
				break;
			case "throwOff": player.target = null;
		}
	}
	collectInputs(keyboard, mouse, mobile, _data) {
		const data = _data;
		const throwTarget = mouse.getCoords();
		data.mouseX = throwTarget.x;
		data.mouseY = throwTarget.y;
		function getMoveInput() {
			const r0 = keyboard.first("right");
			const l0 = keyboard.first("left");
			const right = {
				right: {},
				action: "right"
			};
			const left = {
				left: {},
				action: "left"
			};
			const stop = {
				stop: {},
				action: "stop"
			};
			if (r0 && !l0) return right;
			if (!r0 && l0) return left;
			if (r0 && l0) return stop;
			const rK = keyboard.killed("right");
			const lK = keyboard.killed("left");
			if (rK && lK) return stop;
			const r = keyboard.press("right");
			const l = keyboard.press("left");
			if (rK) return l ? left : stop;
			if (lK) return r ? right : stop;
			return null;
		}
		const inputs = [];
		const moveInput = getMoveInput();
		if (moveInput) inputs.push(moveInput);
		if (keyboard.first("up") || keyboard.first("jump")) inputs.push({
			jump: {},
			action: "jump"
		});
		if (keyboard.first("down")) inputs.push({
			downOn: {},
			action: "downOn"
		});
		if (keyboard.killed("down")) inputs.push({
			downOff: {},
			action: "downOff"
		});
		if (mouse.press(0)) inputs.push({
			throwTarget,
			action: "throwTarget"
		});
		else if (mouse.killed(0)) inputs.push({
			throwOff: {},
			action: "throwOff"
		});
		return inputs;
	}
	getBallDrawCoords() {
		return {
			x: this.ball.x - Ball.RADIUS / 2,
			y: this.ball.y - Ball.RADIUS / 2
		};
	}
	drawMinimap(ctx, playerIdx) {
		const mapWidth = WIDTH$2 * 5;
		const mapHeight = HEIGHT$2 * 3;
		const MINIMAP_WIDTH = WIDTH$2 * MINIMAP_RATIO$1;
		const MINIMAP_HEIGHT = HEIGHT$2 * MINIMAP_RATIO$1;
		ctx.save();
		ctx.translate(MINIMAP_X$1, MINIMAP_Y$1);
		ctx.scale(MINIMAP_WIDTH / mapWidth, MINIMAP_HEIGHT / mapHeight);
		ctx.translate(mapWidth / 2, mapHeight / 2);
		ctx.fillStyle = "rgba(50, 50, 50, 0.7)";
		ctx.fillRect(-6e3, -2025, mapWidth, mapHeight);
		const player = this.players[playerIdx];
		for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) {
			const cellX = -6e3 + x * WIDTH$2;
			const cellY = -2025 + y * HEIGHT$2;
			const ballInside = this.ball.x >= cellX && this.ball.x < cellX + WIDTH$2 && this.ball.y >= cellY && this.ball.y < cellY + HEIGHT$2;
			const playerInside = player.x >= cellX && player.x < cellX + WIDTH$2 && player.y >= cellY && player.y < cellY + HEIGHT$2;
			const bucketInside = this.buckets.some((bucket) => bucket.team === null && bucket.x >= cellX && bucket.x < cellX + WIDTH$2 && bucket.y >= cellY && bucket.y < cellY + HEIGHT$2);
			if (ballInside) ctx.fillStyle = "rgba(255, 165, 0, 0.35)";
			else if (playerInside) ctx.fillStyle = "rgba(255, 255, 0, 0.35)";
			else if (bucketInside) ctx.fillStyle = "rgba(0, 128, 0, 0.35)";
			else continue;
			ctx.fillRect(cellX, cellY, WIDTH$2, HEIGHT$2);
		}
		ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
		ctx.lineWidth = 1 / (MINIMAP_WIDTH / mapWidth);
		for (let x = 1; x < 5; x++) {
			const px = -6e3 + x * WIDTH$2;
			ctx.beginPath();
			ctx.moveTo(px, -2025);
			ctx.lineTo(px, mapHeight / 2);
			ctx.stroke();
		}
		for (let y = 1; y < 3; y++) {
			const py = -2025 + y * HEIGHT$2;
			ctx.beginPath();
			ctx.moveTo(-6e3, py);
			ctx.lineTo(mapWidth / 2, py);
			ctx.stroke();
		}
		for (const bucket of this.buckets) {
			ctx.fillStyle = "green";
			if (bucket.team !== null) continue;
			ctx.beginPath();
			ctx.arc(bucket.x, bucket.y, 75, 0, Math.PI * 2);
			ctx.fill();
		}
		for (const [idx, player] of this.players.entries()) {
			ctx.fillStyle = idx === playerIdx ? "yellow" : player.team === "red" ? "red" : "blue";
			ctx.beginPath();
			ctx.arc(player.x, player.y, idx === playerIdx ? 150 : 100, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = "orange";
		ctx.beginPath();
		ctx.arc(this.ball.x, this.ball.y, 150, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
		ctx.strokeStyle = "white";
		ctx.lineWidth = 2;
		ctx.strokeRect(MINIMAP_X$1, MINIMAP_Y$1, MINIMAP_WIDTH, MINIMAP_HEIGHT);
	}
	draw(ctx, playerIdx, _data, _imageLoader) {
		const imageLoader = _imageLoader.getFolder("airbasket");
		const data = _data;
		if (data.firstFrame) {
			data.firstFrame = false;
			let i = 0;
			for (const j of COLORS) for (const color of j) {
				imageLoader.setColorRule("sky", i, [{
					prev: "#ff00ff",
					next: color
				}, {
					prev: "#770077",
					next: lighten(color, 2)
				}]);
				i++;
			}
		}
		data.update(this, playerIdx);
		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, WIDTH$2, HEIGHT$2);
		const cameraCoords = data.camera.getCoords();
		ctx.save();
		ctx.translate(WIDTH$2 / 2, HEIGHT$2 / 2);
		ctx.scale(Camera$1.SCALE, Camera$1.SCALE);
		ctx.translate(-cameraCoords.x, -cameraCoords.y);
		for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) ctx.drawImage(imageLoader.get("sky", y * 5 + x), (x - 2.5) * WIDTH$2, (y - 1.5) * HEIGHT$2, WIDTH$2, HEIGHT$2);
		for (const bucket of this.buckets) {
			const b = "bucket-" + (bucket.team ?? "mid");
			ctx.drawImage(imageLoader.get(b), bucket.x - Bucket.SIZE / 2, bucket.y - Bucket.SIZE / 2, Bucket.SIZE, Bucket.SIZE);
		}
		for (const [idx, p] of this.players.entries()) {
			if (idx === playerIdx) {
				ctx.fillStyle = "#0f0";
				const r = 1.3;
				ctx.fillRect(p.x - r * Player$3.WIDTH / 2, p.y - r * Player$3.HEIGHT / 2, r * Player$3.WIDTH, r * Player$3.HEIGHT);
			}
			ctx.fillStyle = p.team;
			let [tx, ty, dir] = data.getPlayerTextureCode(this.ball.grabber === idx, p, idx);
			if (p.team === "red") tx += 3;
			const playerTexture = imageLoader.get("skin-" + data.skins[idx]);
			const w = playerTexture.width / 6;
			const h = playerTexture.height / 4;
			const width = Player$3.WIDTH * 4 / 3;
			ctx.save();
			if (dir) {
				ctx.translate(p.x + width / 2, p.y - Player$3.HEIGHT / 2);
				ctx.scale(-1, 1);
				ctx.drawImage(playerTexture, tx * w, ty * h, w, h, 0, 0, width, Player$3.HEIGHT);
			} else ctx.drawImage(playerTexture, tx * w, ty * h, w, h, p.x - width / 2, p.y - Player$3.HEIGHT / 2, width, Player$3.HEIGHT);
			ctx.restore();
		}
		if (this.ball.grabber < 0) {
			const drawBallCoords = this.getBallDrawCoords();
			ctx.drawImage(imageLoader.get("ball"), drawBallCoords.x - Ball.RADIUS / 2, drawBallCoords.y - Ball.RADIUS / 2, Ball.RADIUS, Ball.RADIUS);
		}
		{
			const player = this.players[playerIdx];
			let color;
			if (this.ball.grabber === playerIdx) color = player.team;
			else color = this.ball.prevGrabber !== playerIdx;
			drawPlayerToTarget(ctx, player.x, player.y, data.mouseX, data.mouseY, color);
		}
		ctx.restore();
		this.drawMinimap(ctx, playerIdx);
	}
	onDisconnection(id) {
		this.players[id].connected = false;
	}
	save() {
		const { State } = protocols$3.get();
		const object = {
			players: this.players,
			prevBallGrabber: this.ball.prevGrabber,
			buckets: this.buckets.map((b) => ({
				taken: b.team !== null,
				redTeam: b.team === "red"
			})),
			time: this.time,
			timeStep: this.timeStep,
			redScore: this.redScore,
			blueScore: this.blueScore
		};
		if (this.ball.grabber >= 0) object.grabbedBall = { owner: this.ball.grabber };
		else object.freeBall = this.ball;
		return State.encode(object).finish();
	}
	load(data) {
		const { State } = protocols$3.get();
		const obj = State.decode(data);
		for (const [idx, player] of obj.players.entries()) this.players[idx].load(player);
		for (const [idx, bucket] of obj.buckets.entries()) if (!bucket.taken) this.buckets[idx].team = null;
		else this.buckets[idx].team = bucket.redTeam ? "red" : "blue";
		this.ball.load(obj);
		this.time = obj.time;
		this.timeStep = obj.timeStep;
		this.redScore = obj.redScore;
		this.blueScore = obj.blueScore;
	}
	getSize() {
		return {
			width: WIDTH$2,
			height: HEIGHT$2
		};
	}
	evalMouseCoords(x, y, playerIdx, _clientData) {
		const clientData = _clientData;
		const cameraCoords = clientData.camera.getCoords();
		const ret = {
			x: (x - WIDTH$2 / 2) / Camera$1.SCALE + cameraCoords.x,
			y: (y - HEIGHT$2 / 2) / Camera$1.SCALE + cameraCoords.y
		};
		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;
		return ret;
	}
	getMobileDesc() {
		return null;
	}
	createTutorial() {
		return new TutorialData$2(this);
	}
	produceFinish() {
		const redTeam = [];
		const blueTeam = [];
		const playerEqualities = [];
		for (const [idx, player] of this.players.entries()) if (player.team === "red") redTeam.push(idx);
		else blueTeam.push(idx);
		for (const team of [redTeam, blueTeam]) {
			team.sort((a, b) => this.players[b].score - this.players[a].score);
			for (let i = 0; i < team.length - 2; i++) if (this.players[team[i]].score === this.players[team[i + 1]].score) playerEqualities.push(team[i]);
		}
		let teams;
		const teamEqualities = [];
		if (this.redScore >= this.blueScore) {
			teams = [redTeam, blueTeam];
			if (this.redScore === this.blueScore) teamEqualities.push(0);
		} else teams = [blueTeam, redTeam];
		return {
			results: teams,
			teamEqualities,
			playerEqualities
		};
	}
};
//#endregion
//#region commons/gamemods/GMSuperTicTacToe.ts
var protocols$2 = getProtocol("superTicTacToe", "multiplayer");
var CELL_SIZE = 100;
var SUBGRID_SIZE = 300;
var BOARD_SIZE = SUBGRID_SIZE * 3;
var BOARD_MARGIN = 60;
var WIDTH$1 = 1020;
var HEIGHT$1 = 1020;
var WIN_LINES = [
	[
		0,
		1,
		2
	],
	[
		3,
		4,
		5
	],
	[
		6,
		7,
		8
	],
	[
		0,
		3,
		6
	],
	[
		1,
		4,
		7
	],
	[
		2,
		5,
		8
	],
	[
		0,
		4,
		8
	],
	[
		2,
		4,
		6
	]
];
function emptyCell() {
	return {
		taken: false,
		isRed: false
	};
}
/**
* Scans 9 same-shaped values (either the 9 cells of a sub-grid, or the 9
* sub-grid results of the meta-grid) for a completed line of 3 matching
* marks of the same color.
* Returns 'red' or 'blue' if such a line exists, otherwise null.
*/
function findLineWinner(values) {
	for (const [a, b, c] of WIN_LINES) if (values[a].taken && values[b].taken && values[c].taken && values[a].isRed === values[b].isRed && values[b].isRed === values[c].isRed) return values[a].isRed ? "red" : "blue";
	return null;
}
var Player$2 = class {
	connected = true;
	team = "red";
};
var ClientData$3 = class {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;
	html;
	statusLine;
	you;
	opponent;
	constructor(playerIdx) {
		this.html = document.createElement("div");
		this.html.classList.add("game-superTicTacToe-root");
		this.statusLine = document.createElement("div");
		this.statusLine.classList.add("game-superTicTacToe-status");
		this.you = document.createElement("div");
		this.you.classList.add("game-superTicTacToe-you", playerIdx === 0 ? "game-superTicTacToe-red" : "game-superTicTacToe-blue");
		this.you.innerText = "Your turn";
		this.opponent = document.createElement("div");
		this.opponent.classList.add("game-superTicTacToe-opponent", playerIdx === 0 ? "game-superTicTacToe-blue" : "game-superTicTacToe-red");
		this.opponent.innerText = "Opponent's turn";
		this.statusLine.appendChild(this.you);
		this.statusLine.appendChild(this.opponent);
		this.html.appendChild(this.statusLine);
	}
	/**
	* Refreshes the DOM status line.
	*/
	update(game, playerIdx) {
		if (game.finished) {
			this.you.classList.add("game-superTicTacToe-disabled");
			this.opponent.classList.add("game-superTicTacToe-disabled");
			return;
		}
		const playerColor = playerIdx === 0 ? "red" : "blue";
		const isYourTurn = game.turn === playerColor;
		this.you.classList.toggle("game-superTicTacToe-disabled", !isYourTurn);
		this.opponent.classList.toggle("game-superTicTacToe-disabled", isYourTurn);
	}
};
var TutorialData$1 = class {
	game;
	shown = false;
	constructor(game) {
		this.game = game;
	}
	/**
	* Super Tic Tac Toe only needs a single, static piece of guidance: the
	* rule that determines which sub-grid you are sent to next. It is shown
	* once at the start and then cleared.
	*/
	frame(dt, clock) {
		if (this.shown) return "";
		if (clock > 6) {
			this.shown = true;
			return "";
		}
		return "Playing a cell sends your opponent to the matching sub-grid!";
	}
};
function generateClientDom$3() {
	return {
		preferTeam: 0,
		produce() {
			const { StartData } = protocols$2.get();
			return StartData.encode({ preferTeam: this.preferTeam }).finish();
		}
	};
}
var GMSuperTicTacToe = class GMSuperTicTacToe extends GameMode {
	static types = { Player: Player$2 };
	static DATA = {
		WIDTH: WIDTH$1,
		HEIGHT: HEIGHT$1,
		CELL_SIZE,
		SUBGRID_SIZE,
		BOARD_SIZE,
		BOARD_MARGIN
	};
	players;
	cells;
	subgridWinners;
	subgridFull;
	turn = "red";
	forced = -1;
	finished = false;
	winner = null;
	constructor(total) {
		super();
		this.players = Array.from({ length: total }, () => new Player$2());
		this.cells = Array.from({ length: 81 }, emptyCell);
		this.subgridWinners = Array.from({ length: 9 }, emptyCell);
		this.subgridFull = Array.from({ length: 9 }, () => false);
	}
	static async createServ(players, total, hasSkin) {
		const { StartData, StartDataClient } = protocols$2.get();
		const game = new GMSuperTicTacToe(total);
		function decodePreference(i) {
			if (i < players.length) return decodeFullMessage(StartData.decode(players[i].data)).preferTeam ?? 0;
			return 0;
		}
		const preferences = game.players.map((_, i) => decodePreference(i));
		let redIndex = -1;
		let blueIndex = -1;
		for (let i = 0; i < preferences.length; i++) if (preferences[i] === 1 && redIndex < 0) redIndex = i;
		else if (preferences[i] === -1 && blueIndex < 0) blueIndex = i;
		for (let i = 0; i < preferences.length; i++) {
			if (i === redIndex || i === blueIndex) continue;
			if (redIndex < 0) redIndex = i;
			else if (blueIndex < 0) blueIndex = i;
		}
		for (const [i, p] of game.players.entries()) p.team = i === redIndex ? "red" : "blue";
		return {
			game,
			data: StartDataClient.encode({ players: game.players.map((p) => ({ isRed: p.team === "red" })) }).finish()
		};
	}
	static createClient(data, total, playerIdx) {
		const game = new GMSuperTicTacToe(total);
		const { StartDataClient } = protocols$2.get();
		const clientData = new ClientData$3(playerIdx);
		if (data) {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
			for (const [idx, p] of players.entries()) game.players[idx].team = p.isRed ? "red" : "blue";
		} else {
			game.players[0].team = "red";
			if (game.players[1]) game.players[1].team = "blue";
		}
		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: {}
		};
	}
	static generateClientDom = generateClientDom$3;
	static TEXTURES = {};
	init() {}
	getBotIds(count) {
		return Array.from({ length: count }, () => 0);
	}
	run(dt, produceFinish) {
		if (produceFinish && this.finished) return this.produceFinish();
		return null;
	}
	runInput(playerIdx, input) {
		if (this.finished) return;
		if (this.players[playerIdx].team !== this.turn) return;
		if (input.action !== "cell") return;
		const cell = input.cell;
		if (!Number.isInteger(cell) || cell < 0 || cell > 80) return;
		const globalX = cell % 9;
		const globalY = Math.floor(cell / 9);
		const subgridX = Math.floor(globalX / 3);
		const subgridIndex = Math.floor(globalY / 3) * 3 + subgridX;
		const localX = globalX % 3;
		const localIndex = globalY % 3 * 3 + localX;
		if (this.subgridWinners[subgridIndex].taken) return;
		if (this.subgridFull[subgridIndex]) return;
		if (this.forced >= 0 && subgridIndex !== this.forced) return;
		const cellValue = this.cells[cell];
		if (cellValue.taken) return;
		cellValue.taken = true;
		cellValue.isRed = this.turn === "red";
		this.settleSubgrid(subgridIndex);
		this.checkMetaWin();
		if (!this.finished) {
			let nextForced = localIndex;
			if (this.subgridWinners[nextForced].taken || this.subgridFull[nextForced]) nextForced = -1;
			this.forced = nextForced;
			this.turn = this.turn === "red" ? "blue" : "red";
			this.checkAllSubgridsDecided();
		}
	}
	/**
	* Re-evaluates a single sub-grid after a cell was just played inside
	* it: checks for a 3-in-a-row win among its 9 cells, and otherwise
	* marks it full once every one of its cells has been played.
	*/
	settleSubgrid(subgridIndex) {
		const subgridX = subgridIndex % 3;
		const subgridY = Math.floor(subgridIndex / 3);
		const subgridCells = [];
		for (let ly = 0; ly < 3; ly++) for (let lx = 0; lx < 3; lx++) {
			const gx = subgridX * 3 + lx;
			const gy = subgridY * 3 + ly;
			subgridCells.push(this.cells[gy * 9 + gx]);
		}
		const winner = findLineWinner(subgridCells);
		if (winner !== null) {
			this.subgridWinners[subgridIndex] = {
				taken: true,
				isRed: winner === "red"
			};
			return;
		}
		if (subgridCells.every((c) => c.taken)) this.subgridFull[subgridIndex] = true;
	}
	/**
	* Checks the meta-grid (the 3x3 grid of sub-grid results) for a
	* completed alignment of 3 sub-grids won by the same team. If found,
	* the whole match ends immediately in that team's favor.
	*/
	checkMetaWin() {
		const winner = findLineWinner(this.subgridWinners);
		if (winner !== null) {
			this.finished = true;
			this.winner = winner;
		}
	}
	/**
	* Checks whether every sub-grid has now been resolved (either won by a
	* team or filled up without a winner). If so, the match ends and the
	* winner is whichever team captured strictly more sub-grids -- a tie
	* in sub-grid count ends the match in a draw.
	*/
	checkAllSubgridsDecided() {
		if (!this.subgridWinners.every((w, i) => w.taken || this.subgridFull[i])) return;
		const redCount = this.subgridWinners.filter((w) => w.taken && w.isRed).length;
		const blueCount = this.subgridWinners.filter((w) => w.taken && !w.isRed).length;
		this.finished = true;
		if (redCount === blueCount) this.winner = "draw";
		else this.winner = redCount > blueCount ? "red" : "blue";
	}
	collectInputs(keyboard, mouse, mobile, _data) {
		const data = _data;
		const inputs = [];
		const coords = mouse.getCoords();
		data.mouseX = coords.x;
		data.mouseY = coords.y;
		if (mouse.first(0)) {
			const cell = GMSuperTicTacToe.cellFromBoardCoords(coords.x, coords.y);
			if (cell !== null) inputs.push({
				action: "cell",
				cell
			});
		} else if (mobile && mobile.first(0)) {
			const { x, y } = mobile.getDigits()[0];
			const cell = GMSuperTicTacToe.cellFromBoardCoords(x, y);
			if (cell !== null) inputs.push({
				action: "cell",
				cell
			});
		}
		return inputs;
	}
	/**
	* Converts board-space pixel coordinates (already relative to the
	* board's own coordinate system, see evalMouseCoords) into a flat cell
	* index in [0..80], or null if the position falls outside the board.
	*/
	static cellFromBoardCoords(x, y) {
		const bx = x - BOARD_MARGIN;
		const by = y - BOARD_MARGIN;
		if (bx < 0 || by < 0 || bx >= BOARD_SIZE || by >= BOARD_SIZE) return null;
		const globalX = Math.floor(bx / CELL_SIZE);
		return Math.floor(by / CELL_SIZE) * 9 + globalX;
	}
	drawMark(ctx, cx, cy, size, isRed) {
		const half = size * .32;
		ctx.lineWidth = size * .12;
		ctx.lineCap = "round";
		ctx.strokeStyle = isRed ? "#e63946" : "#3a86ff";
		if (isRed) {
			ctx.beginPath();
			ctx.moveTo(cx - half, cy - half);
			ctx.lineTo(cx + half, cy + half);
			ctx.moveTo(cx + half, cy - half);
			ctx.lineTo(cx - half, cy + half);
			ctx.stroke();
		} else {
			ctx.beginPath();
			ctx.arc(cx, cy, half, 0, Math.PI * 2);
			ctx.stroke();
		}
	}
	draw(ctx, playerIdx, _data, _imageLoader) {
		ctx.imageSmoothingEnabled = true;
		const data = _data;
		if (data.firstFrame) data.firstFrame = false;
		data.update(this, playerIdx);
		ctx.fillStyle = "#1e1e24";
		ctx.fillRect(0, 0, WIDTH$1, HEIGHT$1);
		ctx.save();
		ctx.translate(BOARD_MARGIN, BOARD_MARGIN);
		ctx.fillStyle = "#f4f1ea";
		ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
		for (let s = 0; s < 9; s++) {
			if (!(!this.subgridWinners[s].taken && !this.subgridFull[s] && (this.forced < 0 || this.forced === s))) continue;
			const sx = s % 3 * SUBGRID_SIZE;
			const sy = Math.floor(s / 3) * SUBGRID_SIZE;
			ctx.fillStyle = this.turn === "red" ? "#ffbaba" : "#bdd2ff";
			ctx.fillRect(sx, sy, SUBGRID_SIZE, SUBGRID_SIZE);
		}
		ctx.strokeStyle = "#c9c3b6";
		ctx.lineWidth = 2;
		for (let i = 1; i < 9; i++) {
			ctx.beginPath();
			ctx.moveTo(i * CELL_SIZE, 0);
			ctx.lineTo(i * CELL_SIZE, BOARD_SIZE);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(0, i * CELL_SIZE);
			ctx.lineTo(BOARD_SIZE, i * CELL_SIZE);
			ctx.stroke();
		}
		ctx.strokeStyle = "#3a3a3a";
		ctx.lineWidth = 6;
		for (let i = 1; i < 3; i++) {
			ctx.beginPath();
			ctx.moveTo(i * SUBGRID_SIZE, 0);
			ctx.lineTo(i * SUBGRID_SIZE, BOARD_SIZE);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(0, i * SUBGRID_SIZE);
			ctx.lineTo(BOARD_SIZE, i * SUBGRID_SIZE);
			ctx.stroke();
		}
		for (let i = 0; i < 81; i++) {
			const cell = this.cells[i];
			if (!cell.taken) continue;
			const gx = i % 9;
			const gy = Math.floor(i / 9);
			const cx = gx * CELL_SIZE + CELL_SIZE / 2;
			const cy = gy * CELL_SIZE + CELL_SIZE / 2;
			this.drawMark(ctx, cx, cy, CELL_SIZE, cell.isRed);
		}
		for (let s = 0; s < 9; s++) {
			const sx = s % 3 * SUBGRID_SIZE;
			const sy = Math.floor(s / 3) * SUBGRID_SIZE;
			if (this.subgridWinners[s].taken) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
				ctx.fillRect(sx, sy, SUBGRID_SIZE, SUBGRID_SIZE);
				this.drawMark(ctx, sx + SUBGRID_SIZE / 2, sy + SUBGRID_SIZE / 2, SUBGRID_SIZE, this.subgridWinners[s].isRed);
			} else if (this.subgridFull[s]) {
				ctx.fillStyle = "rgba(120, 120, 120, 0.35)";
				ctx.fillRect(sx, sy, SUBGRID_SIZE, SUBGRID_SIZE);
			}
		}
		const hovered = GMSuperTicTacToe.cellFromBoardCoords(data.mouseX, data.mouseY);
		if (hovered !== null && !this.finished) {
			const hgx = hovered % 9;
			const hgy = Math.floor(hovered / 9);
			ctx.strokeStyle = this.turn === "red" ? "#e63946" : "#3a86ff";
			ctx.lineWidth = 3;
			ctx.strokeRect(hgx * CELL_SIZE + 2, hgy * CELL_SIZE + 2, 96, 96);
		}
		ctx.restore();
	}
	onDisconnection(id) {
		this.players[id].connected = false;
	}
	save() {
		const { State } = protocols$2.get();
		const object = {
			cells: this.cells.map((c) => ({
				taken: c.taken,
				isRed: c.isRed
			})),
			subgridWinners: this.subgridWinners.map((w) => ({
				taken: w.taken,
				isRed: w.isRed
			})),
			subgridFull: this.subgridFull.slice(),
			redTurn: this.turn === "red",
			forced: this.forced,
			finished: this.finished,
			draw: this.winner === "draw",
			redWon: this.winner === "red"
		};
		return State.encode(object).finish();
	}
	load(data) {
		const { State } = protocols$2.get();
		const obj = decodeFullMessage(State.decode(data));
		this.cells = obj.cells.map((c) => ({
			taken: c.taken,
			isRed: c.isRed
		}));
		this.subgridWinners = obj.subgridWinners.map((w) => ({
			taken: w.taken,
			isRed: w.isRed
		}));
		this.subgridFull = [...obj.subgridFull];
		this.turn = obj.redTurn ? "red" : "blue";
		this.forced = obj.forced;
		this.finished = obj.finished;
		if (!obj.finished) this.winner = null;
		else if (obj.draw) this.winner = "draw";
		else this.winner = obj.redWon ? "red" : "blue";
	}
	getSize() {
		return {
			width: WIDTH$1,
			height: HEIGHT$1
		};
	}
	evalMouseCoords(x, y, playerIdx, _clientData) {
		const clientData = _clientData;
		clientData.mouseX = x;
		clientData.mouseY = y;
		return {
			x,
			y
		};
	}
	getMobileDesc() {
		return {
			joysticks: {},
			buttons: {}
		};
	}
	createTutorial() {
		return new TutorialData$1(this);
	}
	/**
	* Builds the FinishGame payload once the match is over. Each team
	* contains exactly one player (this is a strict 1v1 game mode), so
	* `results` always holds two single-player teams and `playerEqualities`
	* is always empty -- there can never be an intra-team tie with only one
	* player per team.
	*/
	produceFinish() {
		const redPlayerIdx = this.players.findIndex((p) => p.team === "red");
		const bluePlayerIdx = this.players.findIndex((p) => p.team === "blue");
		let results;
		let teamEqualities = [];
		if (this.winner === "red") results = [[redPlayerIdx], [bluePlayerIdx]];
		else if (this.winner === "blue") results = [[bluePlayerIdx], [redPlayerIdx]];
		else {
			results = [[redPlayerIdx], [bluePlayerIdx]];
			teamEqualities = [0];
		}
		return {
			results,
			teamEqualities,
			playerEqualities: []
		};
	}
};
//#endregion
//#region commons/gamemods/GMTest.ts
var protocols$1 = getProtocol("test", "multiplayer");
var LOG_LEVEL = "info";
var Player$1 = class {
	x;
	y;
	team;
	connected = true;
	move = 0;
	constructor(x, y, team) {
		this.x = x;
		this.y = y;
		this.team = team;
	}
	update(obj) {
		this.x = obj.x;
		this.y = obj.y;
		this.move = obj.move;
	}
};
var ClientData$2 = class {};
function generateClientDom$2() {
	return {
		choosen: 0,
		produce() {
			const { StartData } = protocols$1.get();
			return StartData.encode({ testNumber: this.choosen }).finish();
		}
	};
}
var Tutorial = class {
	frame(dt, clock) {
		return "Placeholder";
	}
};
var GMTest = class GMTest extends GameMode {
	static types = { Player: Player$1 };
	players;
	constructor(total) {
		super();
		this.players = Array.from({ length: total }, () => new Player$1(0, 0, "red"));
	}
	static async createServ(players, total) {
		GMTest.getLogger("game-test", LOG_LEVEL).debug("Starting choices " + JSON.stringify(players.map((p) => {
			const { StartData } = protocols$1.get();
			return decodeFullMessage(StartData.decode(p.data)).testNumber;
		})));
		const game = new GMTest(total);
		for (let i = 0; i < game.players.length; i++) {
			const p = game.players[i];
			p.x = i * 10;
			p.y = 1e3;
			p.team = i % 2 == 0 ? "red" : "blue";
		}
		return {
			game,
			data: /* @__PURE__ */ new Uint8Array()
		};
	}
	static createClient(data, total) {
		const game = new GMTest(total);
		for (let i = 0; i < game.players.length; i++) {
			const p = game.players[i];
			p.x = i * 10;
			p.y = 1e3;
			p.team = i % 2 == 0 ? "red" : "blue";
		}
		return {
			game,
			data: new ClientData$2(),
			html: null,
			skins: {}
		};
	}
	static generateClientDom = generateClientDom$2;
	static TEXTURES = {};
	init() {}
	getBotIds(count) {
		return Array.from({ length: count }, () => 0);
	}
	produceFinish() {
		return {
			results: [[1, 2], [0, 3]],
			teamEqualities: [],
			playerEqualities: [0]
		};
	}
	run(dt, produceFinish) {
		for (const p of this.players) p.y += p.move * dt;
		GMTest.getLogger("game-test", LOG_LEVEL).debug(`y0=${this.players[0].y.toFixed(2)} dt=${dt}`);
		if (produceFinish) {
			for (const [idx, p] of this.players.entries()) if (p.y < 0) return this.produceFinish();
		}
		return null;
	}
	runInput(playerIdx, input) {
		const logger = GMTest.getLogger("game-test", LOG_LEVEL);
		const player = this.players[playerIdx];
		if (input.move !== void 0) {
			player.move = input.move;
			logger.debug(`input ${input.move} ${playerIdx}`);
		}
	}
	collectInputs(keyboard, mouse, mobile, _data) {
		const inputs = [];
		if (keyboard.first("up")) inputs.push({ move: 300 });
		if (keyboard.first("down")) inputs.push({ move: -300 });
		if (keyboard.killed("up") || keyboard.killed("down")) inputs.push({ move: 1e-16 });
		if (mobile) console.log(JSON.stringify(mobile.getDigits()), mobile.first("up"), mobile.press("up"), mobile.press("joy"), mobile.getJoystick("joy"));
		return inputs;
	}
	draw(ctx, playerIdx, _data, imageLoader, dt) {
		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, 200, 2e3);
		ctx.fillStyle = "red";
		for (const p of this.players) ctx.fillRect(p.x, p.y - 5, 10, 10);
	}
	onDisconnection(id) {
		this.players[id].connected = false;
	}
	save() {
		const { State } = protocols$1.get();
		return State.encode(this).finish();
	}
	load(data) {
		const { State } = protocols$1.get();
		const obj = State.decode(data);
		for (const [idx, player] of obj.players.entries()) this.players[idx].update(player);
	}
	getSize() {
		return {
			width: 100,
			height: 2e3
		};
	}
	evalMouseCoords(x, y) {
		return {
			x,
			y
		};
	}
	getMobileDesc() {
		return {
			joysticks: { joy: {
				x: 100,
				xp: "left",
				y: 120,
				yp: "bottom",
				size: 100,
				color: "#00ff00"
			} },
			buttons: {
				up: {
					x: 50,
					xp: "right",
					y: 120,
					yp: "bottom",
					size: 50,
					color: "#ff0000"
				},
				down: {
					x: 50,
					xp: "right",
					y: 70,
					yp: "bottom",
					size: 50,
					color: "#ff0000"
				}
			}
		};
	}
	createTutorial() {
		return new Tutorial();
	}
};
//#endregion
//#region commons/SoloGameMode.ts
var SoloGameMode = class SoloGameMode {
	static MAX_DT = .02;
	quickEmulate(duration, clock) {
		while (duration > SoloGameMode.MAX_DT) {
			const f = this.run(SoloGameMode.MAX_DT, clock);
			if (f) return f;
			duration -= SoloGameMode.MAX_DT;
			clock += SoloGameMode.MAX_DT;
		}
		return this.run(duration, clock);
	}
};
//#endregion
//#region commons/gamemods/GMTestSolo.ts
function generateClientDom$1() {
	return {
		category: "default",
		produce() {
			return this.category;
		}
	};
}
var ClientData$1 = class {};
var GMTestSolo = class GMTestSolo extends SoloGameMode {
	static TEXTURES = {};
	static CATEGORIES = ["default"];
	static MIN_FIRST = true;
	static generateClientDom = generateClientDom$1;
	static create = () => new GMTestSolo();
	player = 500;
	move = 0;
	init(category, rng, generateClientData) {
		if (generateClientData) return new ClientData$1();
	}
	collectInputs(keyboard, mouse, mobile, data) {
		const inputs = [];
		if (keyboard.first("up")) inputs.push({ move: -300 });
		if (keyboard.first("down")) inputs.push({ move: 300 });
		if (keyboard.killed("up") || keyboard.killed("down")) inputs.push({ move: 1e-16 });
		return inputs;
	}
	runInput(input) {
		this.move = input.move;
	}
	run(dt, clock) {
		this.player += this.move * dt;
		if (this.player <= 0) return clock;
		return null;
	}
	draw(ctx, data, imageLoader, dt) {
		ctx.fillStyle = "red";
		ctx.fillRect(0, this.player, 1600, 10);
	}
	getSize() {
		return {
			width: 1600,
			height: 900
		};
	}
	evalMouseCoords(x, y, playerIdx, clientData) {
		return {
			x,
			y
		};
	}
	getMobileDesc() {
		return null;
	}
};
//#endregion
//#region commons/util/norm2.ts
function norm2(dx, dy) {
	return dx * dx + dy * dy;
}
//#endregion
//#region commons/gamemods/GMTurrets.ts
var protocols = getProtocol("turrets", "multiplayer");
var GRAVITY = 1100;
var WIDTH = 2400;
var HEIGHT = 1350;
var FULL_ROOM_SIZE = WIDTH * 2.5;
var ROOM_SIZE = WIDTH * 1.5;
var BRIDGE_SIZE = WIDTH * .3;
var BULLET_DAMAGE = 15;
var TURRET_RADIUS = WIDTH * .6;
var TURRET_ACTIVATION = 2e3;
var TURRET_COOLDOWN = 2;
var TURRET_HP = 1200;
var TURRET_START_COOLDOWN = 5;
var TURRET_ITEM_DAMAGES = 500;
var MINIMAP_X = WIDTH * .79;
var MINIMAP_Y = HEIGHT * .01;
var MINIMAP_RATIO = .2;
var STAR_DURATION = 10;
var ITEM_COUNT = 3;
var TURRET_ITEM_COUNT = 2;
var ITEMS_CYCLE = [
	2,
	5,
	1,
	3,
	2,
	0,
	4,
	5,
	2,
	1,
	6,
	7,
	1,
	0,
	3,
	4,
	2,
	1,
	3,
	0,
	2,
	0,
	4,
	2,
	1,
	5,
	7,
	2,
	0,
	4,
	5,
	2,
	1,
	3,
	2,
	0,
	4,
	2,
	4,
	1,
	7,
	3,
	2,
	0,
	4,
	2,
	1,
	5,
	2,
	0
];
var SPAWN_COLORS = [
	[
		"red",
		"red",
		"red",
		"red",
		"red"
	],
	[
		"red",
		null,
		null,
		null,
		"red"
	],
	[
		null,
		null,
		null,
		null,
		null
	],
	[
		"blue",
		null,
		null,
		null,
		"blue"
	],
	[
		"blue",
		"blue",
		"blue",
		"blue",
		"blue"
	]
];
var Player = class Player {
	x;
	y;
	static SPEED = 2e3;
	static ACCELERATION = 12e3;
	static MIN_DECELERATION = 1100;
	static SOFT_DECELERATION = 12e3;
	static QUICK_DECELERATION = 4e4;
	static COOLDOWN = 2;
	static RADIUS = 60;
	static PUSH_DOWN = 1e3;
	static THROW = 1200;
	static BOUNCE_X = 1e3;
	static BOUNCE_Y = 100;
	static MAX_HP = 600;
	static HP_INC = 100;
	static HEAL_COOLDOWN = 3;
	static ATTACK_FULL = 5;
	static ATTACK_RELOAD = 3;
	static ATTACK_SLOW_RELOAD = 1.8;
	static ATTACK_COOLDOWN = 2;
	static ATTACK_DELAY = .5;
	static GRAB_GRAVITY = 900;
	spawnX = null;
	spawnY = null;
	connected = true;
	alive = -1;
	vx = 0;
	vy = 0;
	dirX = 0;
	dirY = 0;
	hp = Player.MAX_HP;
	maxHp = Player.MAX_HP;
	healCooldown = Player.HEAL_COOLDOWN;
	target = null;
	team = "red";
	items = Array(ITEM_COUNT).fill(-1);
	selectedItem = -1;
	starDuration = -1;
	kills = 0;
	attackMunitions = Player.ATTACK_FULL;
	attackCooldown = 0;
	attackTimer = Player.ATTACK_DELAY;
	attackFullyReloading = false;
	invincible = false;
	speedMultiplier = 1;
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
	initSpawn(x, y, team) {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
		this.team = team;
	}
	isAlive() {
		return this.alive < 0;
	}
	/**
	* Wipes every per-frame effect. Called once at the start of the frame,
	* before entities run and possibly re-apply their effects.
	*/
	resetEffects() {
		this.invincible = false;
		this.speedMultiplier = 1;
		this.starDuration = -1;
	}
	static applyMovement(dirX, dirY, vx, vy, dt, speedMultiplier) {
		const dirLength2 = dirX * dirX + dirY * dirY;
		if (dirLength2 >= 1) {
			const inv = 1 / Math.sqrt(dirLength2);
			dirX *= inv;
			dirY *= inv;
		}
		if (dirX === 0 && dirY === 0) {
			const speed = Math.hypot(vx, vy);
			if (speed === 0) return [0, 0];
			const deceleration = Player.SOFT_DECELERATION * dt;
			if (speed <= deceleration) return [0, 0];
			const factor = (speed - deceleration) / speed;
			return [vx * factor, vy * factor];
		}
		const speed = Math.hypot(vx, vy);
		const forwardSpeed = vx * dirX + vy * dirY;
		if (forwardSpeed < 0) {
			const deceleration = Player.QUICK_DECELERATION * dt;
			if (speed <= deceleration) return [0, 0];
			const factor = (speed - deceleration) / speed;
			return [vx * factor, vy * factor];
		}
		const dirLength = Math.hypot(dirX, dirY);
		const targetSpeed = Player.SPEED * speedMultiplier * dirLength;
		if (forwardSpeed < targetSpeed) {
			const acceleration = Player.ACCELERATION * dt;
			const newSpeed = Math.min(forwardSpeed + acceleration, targetSpeed);
			return [dirX / dirLength * newSpeed, dirY / dirLength * newSpeed];
		}
		if (speed > targetSpeed) {
			const deceleration = Player.MIN_DECELERATION * dt;
			const newSpeed = Math.max(speed - deceleration, targetSpeed);
			return [vx / speed * newSpeed, vy / speed * newSpeed];
		}
		return [vx, vy];
	}
	move(dt) {
		if (this.alive >= 0) {
			this.alive -= dt;
			if (this.alive >= 0) return;
			if (this.spawnX !== null) this.x = this.spawnX;
			if (this.spawnY !== null) this.y = this.spawnY;
			this.hp = this.maxHp;
			this.attackMunitions = Player.ATTACK_FULL;
			this.attackFullyReloading = false;
			this.attackCooldown = 0;
			this.attackTimer = Player.ATTACK_DELAY;
		}
		[this.vx, this.vy] = Player.applyMovement(this.dirX, this.dirY, this.vx, this.vy, dt, this.speedMultiplier);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		if (this.healCooldown > 0) this.healCooldown -= dt;
		if (this.healCooldown <= 0) this.hp = Math.min(this.hp + Player.HP_INC * dt, Player.MAX_HP);
		this.avoidOOB();
		if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
	}
	avoidOutOfFloor(floors) {
		if (!floors || floors.length === 0) return;
		let isInsideAnyFloor = false;
		for (const f of floors) if (this.x >= f.x0 && this.x <= f.x1 && this.y >= f.y0 && this.y <= f.y1) {
			isInsideAnyFloor = true;
			break;
		}
		if (isInsideAnyFloor) return;
		let closestX = this.x;
		let closestY = this.y;
		let minDistanceSq = Infinity;
		for (const f of floors) {
			const clampedX = Math.max(f.x0, Math.min(this.x, f.x1));
			const clampedY = Math.max(f.y0, Math.min(this.y, f.y1));
			const dx = this.x - clampedX;
			const dy = this.y - clampedY;
			const distSq = dx * dx + dy * dy;
			if (distSq < minDistanceSq) {
				minDistanceSq = distSq;
				closestX = clampedX;
				closestY = clampedY;
			}
		}
		this.x = closestX;
		this.y = closestY;
	}
	load(obj) {
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.dirX = obj.dirX;
		this.dirY = obj.dirY;
		this.alive = obj.alive;
		this.hp = obj.hp;
		this.maxHp = obj.maxHp;
		this.healCooldown = obj.healCooldown;
		this.attackMunitions = obj.attackMunitions;
		this.attackFullyReloading = obj.attackFullyReloading;
		this.attackCooldown = obj.attackCooldown;
		this.attackTimer = obj.attackTimer;
		this.items = obj.items && obj.items.length === ITEM_COUNT ? [...obj.items] : Array(ITEM_COUNT).fill(-1);
		this.selectedItem = obj.selectedItem;
		this.invincible = obj.invincible;
		this.speedMultiplier = obj.speedMultiplier;
		this.starDuration = obj.starDuration;
		this.kills = obj.kills;
	}
	avoidOOB() {
		const LIMIT = FULL_ROOM_SIZE * 3;
		const r = Player.RADIUS;
		this.x = Math.max(-18e3 + r, Math.min(LIMIT - r, this.x));
		this.y = Math.max(-18e3 + r, Math.min(LIMIT - r, this.y));
	}
	die() {
		this.vx = 0;
		this.vy = 0;
		this.alive = Player.COOLDOWN;
		this.hp = 0;
		this.healCooldown = Player.HEAL_COOLDOWN;
	}
	attackLogic(dt, idx, game) {
		if (this.attackFullyReloading) {
			this.processReloading(dt);
			return;
		}
		if (this.target !== null && this.isAlive()) {
			if (this.selectedItem !== -1) this.executeItemAttack(game);
			else this.executeStandardAttack(dt, idx, game);
		} else this.processAttackCooldowns(dt);
	}
	/**
	* Executes the logic of a selected item instead of firing a bullet.
	*/
	executeItemAttack(game) {
		const itemId = this.items[this.selectedItem];
		if (itemId === -1) {
			this.selectedItem = -1;
			return;
		}
		const itemDef = ITEMS[itemId];
		if (!itemDef) {
			this.selectedItem = -1;
			return;
		}
		const [dx, dy] = this.resolveTargetVector(game);
		const nextItemId = itemDef.run(game, this, dx, dy);
		if (nextItemId === null) this.items[this.selectedItem] = -1;
		else {
			this.items[this.selectedItem] = nextItemId;
			this.target = null;
		}
		this.attackCooldown = Player.ATTACK_COOLDOWN;
	}
	/**
	* Converts the current targeting system into a raw direction vector (dx, dy).
	*/
	resolveTargetVector(game) {
		if (this.target?.type === "fixed") return [this.target.x - this.x, this.target.y - this.y];
		if (this.target?.type === "delta") return [this.target.dx, this.target.dy];
		if (this.target?.type === "auto") {
			let closestDist = Infinity;
			let closestEnemy = null;
			for (const other of game.players) if (other.team !== this.team && other.isAlive()) {
				const dist = Math.hypot(other.x - this.x, other.y - this.y);
				if (dist < closestDist) {
					closestDist = dist;
					closestEnemy = other;
				}
			}
			if (closestEnemy) return [closestEnemy.x - this.x, closestEnemy.y - this.y];
			return this.team === "red" ? [0, 1] : [0, -1];
		}
		return [0, 1];
	}
	/**
	* Extracts the old bullet firing logic for readability.
	*/
	executeStandardAttack(dt, idx, game) {
		if (this.attackMunitions <= 0) return;
		this.attackMunitions = Math.max(0, this.attackMunitions - dt);
		this.attackCooldown = Player.ATTACK_COOLDOWN;
		this.attackTimer += dt;
		if (this.attackMunitions <= 0) {
			this.attackFullyReloading = true;
			this.attackTimer = 0;
			return;
		}
		if (this.attackTimer >= Player.ATTACK_DELAY) {
			this.attackTimer -= Player.ATTACK_DELAY;
			const [dx, dy] = this.resolveTargetVector(game);
			const baseAngle = Math.atan2(dy, dx);
			for (const pat of Bullet.PATTERNS) {
				const startAngle = baseAngle - pat.angle / 2;
				const step = pat.count > 1 ? pat.angle / (pat.count - 1) : 0;
				for (let i = 0; i < pat.count; i++) {
					const a = startAngle + i * step;
					const bdx = Math.cos(a);
					const bdy = Math.sin(a);
					game.bullets.push(Bullet.create(this.x, this.y, bdx, bdy, this.vx, this.vy, this.team, pat.dist, pat.initSpeed, idx));
				}
			}
		}
	}
	processReloading(dt) {
		this.attackMunitions = Math.min(Player.ATTACK_FULL, this.attackMunitions + dt * Player.ATTACK_SLOW_RELOAD);
		if (this.attackMunitions >= Player.ATTACK_FULL) {
			this.attackMunitions = Player.ATTACK_FULL;
			this.attackFullyReloading = false;
			this.attackTimer = Player.ATTACK_DELAY;
		}
	}
	processAttackCooldowns(dt) {
		this.attackTimer = Math.min(this.attackTimer + dt, Player.ATTACK_DELAY);
		if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
		if (this.attackCooldown <= 0) this.attackMunitions = Math.min(Player.ATTACK_FULL, this.attackMunitions + dt * Player.ATTACK_RELOAD);
	}
	hit(damages, attacker) {
		if (this.invincible || this.hp <= 0) return;
		this.healCooldown = Player.HEAL_COOLDOWN;
		this.hp -= damages;
		if (this.hp <= 0) {
			this.die();
			if (attacker) attacker.kills++;
		}
	}
	draw(ctx, imageLoader, currentPlayer, lastAngle) {
		if (!this.isAlive()) return lastAngle;
		const r = 32 / 13;
		let a;
		if (this.dirX !== 0 || this.dirY !== 0) a = Math.atan2(this.dirY, this.dirX);
		else if (this.vx !== 0 || this.vy !== 0) a = Math.atan2(this.vy, this.vx);
		else a = lastAngle;
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.rotate(a);
		ctx.drawImage(imageLoader.get("player-" + this.team), -Player.RADIUS * r / 2, -Player.RADIUS * r / 2, Player.RADIUS * r, Player.RADIUS * r);
		ctx.restore();
		const BAR_W = 80;
		const BAR_H = 10;
		const hpRatio = Math.max(0, this.hp / this.maxHp);
		ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
		ctx.fillRect(this.x - BAR_W / 2, this.y - Player.RADIUS - 15, BAR_W, BAR_H);
		ctx.fillStyle = "#22cc22";
		ctx.fillRect(this.x - BAR_W / 2, this.y - Player.RADIUS - 15, BAR_W * hpRatio, BAR_H);
		if (currentPlayer) {
			const ratio = this.attackMunitions / Player.ATTACK_FULL;
			const y = this.y - Player.RADIUS - 30;
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			ctx.fillRect(this.x - BAR_W / 2, y, BAR_W, BAR_H);
			if (this.attackFullyReloading) {
				ctx.fillStyle = "gray";
				ctx.fillRect(this.x - BAR_W / 2, y, BAR_W, BAR_H);
			} else {
				ctx.fillStyle = this.attackCooldown > 0 ? "orange" : "white";
				ctx.fillRect(this.x - BAR_W / 2, y, BAR_W * ratio, BAR_H);
			}
		}
		if (this.starDuration > 0) {
			const ratio = Math.min(1, this.starDuration / 6);
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			ctx.fillRect(this.x - BAR_W / 2, this.y - Player.RADIUS - 40, BAR_W, BAR_H);
			ctx.fillStyle = "yellow";
			ctx.fillRect(this.x - BAR_W / 2, this.y - Player.RADIUS - 30, BAR_W * ratio, BAR_H);
		}
		return a;
	}
	/**
	* Handles picking up an item on the map or selecting a slot in inventory.
	*/
	interactWithSlot(slot, game) {
		if (slot === this.selectedItem) {
			this.selectedItem = -1;
			return;
		}
		const hoverItemIdx = game.itemsInMap.findIndex((item) => {
			return Math.hypot(item.x - this.x, item.y - this.y) <= ItemInMap.RADIUS + Player.RADIUS;
		});
		if (hoverItemIdx !== -1) this.swapOrPickupItem(slot, hoverItemIdx, game);
		else this.selectedItem = slot;
	}
	/**
	* Swaps the current item in the slot with the one on the ground, or picks it up.
	*/
	swapOrPickupItem(slot, mapItemIdx, game) {
		const mapItem = game.itemsInMap[mapItemIdx];
		const currentSlotItemId = this.items[slot];
		this.items[slot] = mapItem.id;
		if (currentSlotItemId !== -1) mapItem.id = currentSlotItemId;
		else game.itemsInMap.splice(mapItemIdx, 1);
	}
	getTeam() {
		return this.team;
	}
	getRadius() {
		return Player.RADIUS;
	}
};
var Turret = class Turret {
	x;
	y;
	team;
	activation = 0;
	hp = 0;
	itemDamage = 0;
	itemLoadingTimer = 0;
	fullLoadingTimer = 0;
	startCooldown = 0;
	attackCooldown = 0;
	itemsToSpawn = 0;
	spawnIdx = 0;
	prevCapture = false;
	attackSpeedMultiplier = 1;
	static SIZE = 100;
	static constPerUnit(u) {
		const m = .115 * u + .137;
		return 1.2 * m * m;
	}
	constructor(x, y, team = null) {
		this.x = x;
		this.y = y;
		this.team = team;
	}
	/**
	* Wipes every per-frame effect. Called once at the start of the frame,
	* before entities run and possibly re-apply their effects.
	*/
	resetEffects() {
		this.attackSpeedMultiplier = 1;
	}
	/**
	* Applies (or refreshes, for this frame) a fast-attack buff.
	* Called every frame by an attached EBooster while its buff lasts.
	*/
	applyFastAttackEffect(adder) {
		this.attackSpeedMultiplier += adder;
	}
	setItemLoading(game) {
		const cost = Turret.constPerUnit(game.turrets.filter((i) => i.team === this.team).length);
		this.itemLoadingTimer = cost;
		this.fullLoadingTimer = cost;
	}
	/**
	* Handles damage dealt to the turret by bullets.
	*/
	hit(damage, attackerTeam) {
		if (this.team === null) {
			if (attackerTeam === "red") this.activation += damage;
			else this.activation -= damage;
			if (this.activation >= TURRET_ACTIVATION) this.capture("red");
			else if (this.activation <= -2e3) this.capture("blue");
			return;
		}
		if (this.team === attackerTeam) {
			if (this.hp < TURRET_HP) this.hp = Math.min(TURRET_HP, this.hp + damage);
			else {
				this.itemDamage += damage;
				if (this.itemDamage >= TURRET_ITEM_DAMAGES) {
					this.fullLoadingTimer = -1;
					this.itemDamage = 0;
					this.hp -= damage;
				}
			}
		} else {
			this.hp -= damage;
			this.itemDamage = 0;
			if (this.hp <= 0) this.capture(attackerTeam);
		}
	}
	/**
	* Private helper to reset state upon a team capture.
	*/
	capture(newTeam) {
		this.prevCapture = this.team ?? true;
		this.team = newTeam;
		this.hp = TURRET_HP;
		this.activation = 0;
		this.itemDamage = 0;
		this.itemLoadingTimer = 0;
		this.startCooldown = TURRET_START_COOLDOWN;
		this.attackCooldown = 0;
		this.itemsToSpawn = 0;
		this.spawnIdx = newTeam === "red" ? 2 : 6;
	}
	/**
	* Runs every frame to handle cooldowns and bullet spawning.
	*/
	frame(dt, game) {
		if (this.prevCapture === true) {
			if (this.team === "red") game.redScore++;
			else game.blueScore++;
		} else if (this.prevCapture === "red") {
			game.redScore--;
			game.blueScore++;
		} else if (this.prevCapture === "blue") {
			game.redScore++;
			game.blueScore--;
		}
		this.prevCapture = false;
		this.spawnPendingItems(game);
		if (this.fullLoadingTimer < 0) this.setItemLoading(game);
		if (this.itemLoadingTimer > 0) {
			this.itemLoadingTimer -= dt;
			if (this.itemLoadingTimer <= 0) {
				this.itemDamage = 0;
				this.itemsToSpawn += TURRET_ITEM_COUNT;
			}
			return;
		}
		if (this.team === null) return;
		if (this.startCooldown > 0) {
			this.startCooldown -= dt;
			return;
		}
		this.attackCooldown -= dt * this.attackSpeedMultiplier;
		if (this.attackCooldown <= 0) {
			let notFound = true;
			for (const [entity, kind] of game.damageableEntities()) {
				if (kind === "turret" || entity.getTeam() === this.team) continue;
				if (entity.x < this.x - ROOM_SIZE / 2 || entity.x > this.x + ROOM_SIZE / 2 || entity.y < this.y - ROOM_SIZE / 2 || entity.y > this.y + ROOM_SIZE / 2) continue;
				notFound = false;
			}
			if (notFound) return;
			this.attackCooldown = TURRET_COOLDOWN;
			const BULLETS_COUNT = 250;
			const BULLET_SPEED = 5e3;
			for (let i = 0; i < BULLETS_COUNT; i++) {
				const angle = i * (Math.PI * 2 / BULLETS_COUNT);
				const vx = Math.cos(angle) * BULLET_SPEED;
				const vy = Math.sin(angle) * BULLET_SPEED;
				game.bullets.push(Bullet.create(this.x, this.y, vx, vy, 0, 0, this.team, TURRET_RADIUS, BULLET_SPEED, -1));
			}
		}
	}
	/**
	* Spawns items incrementally at specific angles around the turret's border.
	*/
	spawnPendingItems(game) {
		while (this.itemsToSpawn > 0) {
			const angle = this.spawnIdx * (Math.PI / 4);
			const itemX = this.x + Math.cos(angle) * TURRET_RADIUS;
			const itemY = this.y + Math.sin(angle) * TURRET_RADIUS;
			const randomItemId = ITEMS_CYCLE[game.makeCycleStep()];
			game.itemsInMap.push(new ItemInMap(itemX, itemY, randomItemId));
			this.spawnIdx += 3;
			this.itemsToSpawn--;
		}
	}
	/**
	* Draw range circle of the turret.
	*/
	drawBackground(ctx) {
		ctx.beginPath();
		ctx.arc(this.x, this.y, TURRET_RADIUS, 0, Math.PI * 2);
		if (this.team === "red") {
			ctx.fillStyle = "rgba(255, 0, 0, 0.15)";
			ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
		} else if (this.team === "blue") {
			ctx.fillStyle = "rgba(0, 0, 255, 0.15)";
			ctx.strokeStyle = "rgba(0, 0, 255, 0.5)";
		} else {
			ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
			ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
		}
		ctx.fill();
		ctx.lineWidth = 8;
		ctx.stroke();
	}
	/**
	* Draws the turret, and all related status bars.
	*/
	draw(ctx, imageLoader) {
		let colorId;
		if (this.team === "blue") colorId = 1;
		else if (this.team === "red") colorId = 0;
		else colorId = void 0;
		ctx.drawImage(imageLoader.get("turret", colorId), this.x - Turret.SIZE / 2, this.y - Turret.SIZE / 2, Turret.SIZE, Turret.SIZE);
		const BAR_W = 80;
		const BAR_H = 10;
		let barY = this.y - Turret.SIZE / 2 - 20;
		if (this.team === null) {
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W, BAR_H);
			const center = this.x;
			const ratio = Math.abs(this.activation) / TURRET_ACTIVATION;
			const fillW = BAR_W / 2 * ratio;
			if (this.activation > 0) {
				ctx.fillStyle = "red";
				ctx.fillRect(center, barY, fillW, BAR_H);
			} else if (this.activation < 0) {
				ctx.fillStyle = "blue";
				ctx.fillRect(center - fillW, barY, fillW, BAR_H);
			}
		} else {
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W, BAR_H);
			ctx.fillStyle = this.team;
			const hpRatio = Math.max(0, this.hp / TURRET_HP);
			ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W * hpRatio, BAR_H);
			barY -= 14;
			if (this.itemLoadingTimer > 0 && this.fullLoadingTimer > 0) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
				ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W, BAR_H);
				ctx.fillStyle = "gray";
				const pauseRatio = this.itemLoadingTimer / this.fullLoadingTimer;
				ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W * pauseRatio, BAR_H);
			} else if (this.hp === TURRET_HP && this.itemDamage > 0) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
				ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W, BAR_H);
				ctx.fillStyle = "#22cc22";
				const itemRatio = this.itemDamage / TURRET_ITEM_DAMAGES;
				ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W * itemRatio, BAR_H);
			}
		}
	}
	load(obj) {
		if (!obj.taken) this.team = null;
		else this.team = obj.redTeam ? "red" : "blue";
		this.activation = obj.activation;
		this.hp = obj.hp;
		this.itemDamage = obj.itemDamage;
		this.itemLoadingTimer = obj.itemLoadingTimer;
		this.startCooldown = obj.startCooldown;
		this.attackCooldown = obj.attackCooldown;
		this.itemsToSpawn = obj.itemsToSpawn;
		this.spawnIdx = obj.spawnIdx;
		this.fullLoadingTimer = obj.fullLoadingTimer;
	}
	getTeam() {
		return this.team;
	}
	getRadius() {
		return Turret.SIZE;
	}
};
var Bullet = class Bullet {
	x;
	y;
	vx;
	vy;
	a;
	team;
	owner;
	static RADIUS = 10;
	static PATTERNS = [
		{
			count: 5,
			angle: Math.PI / 64,
			dist: 1600,
			initSpeed: 2e3
		},
		{
			count: 5,
			angle: Math.PI / 8,
			dist: 600,
			initSpeed: 1e3
		},
		{
			count: 5,
			angle: Math.PI / 4,
			dist: 200,
			initSpeed: 1e3
		}
	];
	constructor(x, y, vx, vy, a, team, owner) {
		this.x = x;
		this.y = y;
		this.vx = vx;
		this.vy = vy;
		this.a = a;
		this.team = team;
		this.owner = owner;
	}
	static create(x, y, vx0, vy0, sx, sy, team, dist, initSpeed, owner) {
		const length = Math.hypot(vx0, vy0);
		const dx = length > 0 ? vx0 / length : 0;
		const dy = length > 0 ? vy0 / length : 0;
		const vx = dx * initSpeed + sx;
		const vy = dy * initSpeed + sy;
		initSpeed = Math.hypot(vx, vy);
		const a = initSpeed * initSpeed / (2 * dist);
		return new Bullet(x, y, vx, vy, a, team, owner);
	}
	move(dt) {
		const norm = Math.hypot(this.vx, this.vy);
		const nextNorm = norm - this.a * dt;
		if (nextNorm <= 0) return true;
		const r = nextNorm / norm;
		this.vx = this.vx * r;
		this.vy = this.vy * r;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		return Math.abs(this.x) > FULL_ROOM_SIZE * 3 || Math.abs(this.y) > FULL_ROOM_SIZE * 3;
	}
	attack(game) {
		if (game.isBlockedByWall(this.x, this.y)) return true;
		const attacker = this.owner < 0 ? null : game.players[this.owner];
		for (const [target, kind] of game.damageableEntities()) {
			const team = target.getTeam();
			if (kind === "turret") {
				if (this.owner < 0) continue;
			} else if (team === this.team) continue;
			const radius = Bullet.RADIUS + target.getRadius();
			const dx = target.x - this.x;
			const dy = target.y - this.y;
			if (dx * dx + dy * dy > radius * radius) continue;
			if (kind !== "turret" && game.isInsideNoDamageZone(this.x, this.y, target.getRadius(), target.getTeam())) continue;
			if (kind === "player") target.hit(BULLET_DAMAGE, attacker);
			else target.hit(BULLET_DAMAGE, this.team);
			return true;
		}
		return false;
	}
};
var AbstractEntity = class {
	x;
	y;
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
	drawInFront() {
		return false;
	}
};
/**
* A circle that travels in a straight line until it leaves the map.
* While a point sits inside it, NO player of ANY team can take damage there.
*/
var ELifeSlider = class ELifeSlider extends AbstractEntity {
	vx;
	vy;
	radius;
	static SPEED = 125;
	static RADIUS = 500;
	constructor(x, y, vx, vy, radius) {
		super(x, y);
		this.vx = vx;
		this.vy = vy;
		this.radius = radius;
	}
	/**
	* In-game factory: turns the throw direction (dirX, dirY) into a
	* velocity and returns a fresh slider. Used by ITEMS' `run()`.
	*/
	static create(x, y, dirX, dirY) {
		const len = Math.hypot(dirX, dirY) || 1;
		return new ELifeSlider(x, y, dirX / len * ELifeSlider.SPEED, dirY / len * ELifeSlider.SPEED, ELifeSlider.RADIUS);
	}
	getType() {
		return "lifeSlider";
	}
	save() {
		return {
			vx: this.vx,
			vy: this.vy,
			radius: this.radius
		};
	}
	protects(px, py, radius, _team) {
		const sr = this.radius + radius;
		return norm2(px - this.x, py - this.y) <= sr * sr;
	}
	draw(ctx) {
		ctx.save();
		ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
		ctx.strokeStyle = "rgba(0, 255, 0, 0.7)";
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
	run(dt, game) {
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		return !game.isOOB(this.x, this.y, this.radius);
	}
	drawInFront() {
		return true;
	}
	getTeam() {
		return null;
	}
};
/**
* Like ELifeSlider, but only protects its own team, and travels faster.
*/
var EShieldSlider = class EShieldSlider extends AbstractEntity {
	vx;
	vy;
	radius;
	team;
	static SPEED = 200;
	static RADIUS = 200;
	constructor(x, y, vx, vy, radius, team) {
		super(x, y);
		this.vx = vx;
		this.vy = vy;
		this.radius = radius;
		this.team = team;
	}
	/**
	* In-game factory: turns the throw direction (dirX, dirY) into a
	* velocity and returns a fresh shield slider for `team`.
	*/
	static create(x, y, dirX, dirY, team) {
		const len = Math.hypot(dirX, dirY) || 1;
		return new EShieldSlider(x, y, dirX / len * EShieldSlider.SPEED, dirY / len * EShieldSlider.SPEED, EShieldSlider.RADIUS, team);
	}
	getType() {
		return "shieldSlider";
	}
	save() {
		return {
			vx: this.vx,
			vy: this.vy,
			radius: this.radius,
			redTeam: this.team === "red"
		};
	}
	protects(px, py, radius, team) {
		const sr = this.radius + radius;
		return team === this.team && norm2(px - this.x, py - this.y) <= sr * sr;
	}
	draw(ctx) {
		ctx.save();
		ctx.fillStyle = this.team === "red" ? "rgba(255, 0, 0, 0.15)" : "rgba(0, 0, 255, 0.15)";
		ctx.strokeStyle = this.team === "red" ? "rgba(255, 80, 80, 0.8)" : "rgba(80, 80, 255, 0.8)";
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
	run(dt, game) {
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		return !game.isOOB(this.x, this.y, this.radius);
	}
	drawInFront() {
		return true;
	}
	getTeam() {
		return this.team;
	}
};
/**
* A square that blocks bullets (but not players) for 10 * Wall.DURATION.
*/
var EWall = class EWall extends AbstractEntity {
	timer;
	static DURATION = 3;
	static TOTAL_DURATION = 10 * EWall.DURATION;
	static SIZE = 180;
	constructor(x, y, timer = EWall.TOTAL_DURATION) {
		super(x, y);
		this.timer = timer;
	}
	/** In-game factory: drops a fresh wall at (x, y), fully charged. */
	static create(x, y) {
		return new EWall(x, y);
	}
	getType() {
		return "wall";
	}
	save() {
		return { timer: this.timer };
	}
	blocksBullet(bx, by) {
		const half = EWall.SIZE / 2;
		return Math.abs(bx - this.x) <= half && Math.abs(by - this.y) <= half;
	}
	draw(ctx) {
		const half = EWall.SIZE / 2;
		ctx.save();
		ctx.fillStyle = "rgba(150, 150, 150, 0.6)";
		ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
		ctx.lineWidth = 4;
		ctx.fillRect(this.x - half, this.y - half, EWall.SIZE, EWall.SIZE);
		ctx.strokeRect(this.x - half, this.y - half, EWall.SIZE, EWall.SIZE);
		ctx.fillStyle = "#ffffff";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = "bold 32px sans-serif";
		ctx.fillText((this.timer / EWall.DURATION).toFixed(1), this.x, this.y);
		ctx.restore();
	}
	run(dt) {
		this.timer -= dt;
		return this.timer > 0;
	}
	drawInFront() {
		return true;
	}
	getTeam() {
		return null;
	}
};
var EBallon = class EBallon extends AbstractEntity {
	team;
	radius;
	growthSpeed;
	exploded;
	static GROWTH_ACCELERATION = 60;
	static PADDING = 120;
	static DAMAGE = 150;
	constructor(x, y, team, radius = 0, growthSpeed = 0, exploded = false) {
		super(x, y);
		this.team = team;
		this.radius = radius;
		this.growthSpeed = growthSpeed;
		this.exploded = exploded;
	}
	static create(x, y, team) {
		return new EBallon(x, y, team);
	}
	getType() {
		return "ballon";
	}
	save() {
		return {
			radius: this.radius,
			redTeam: this.team === "red",
			exploded: this.exploded,
			growthSpeed: this.growthSpeed
		};
	}
	detectsEnemy(game) {
		const playerRange = this.radius + Player.RADIUS;
		const playerRange2 = playerRange * playerRange;
		for (const p of game.players) if (p.isAlive() && p.team !== this.team && norm2(p.x - this.x, p.y - this.y) <= playerRange2) return true;
		const turretRange = this.radius + Turret.SIZE;
		const turretRange2 = turretRange * turretRange;
		for (const t of game.turrets) if (norm2(t.x - this.x, t.y - this.y) <= turretRange2) return true;
		return false;
	}
	draw(ctx) {
		ctx.save();
		ctx.fillStyle = this.team === "red" ? "rgba(255, 60, 60, 0.5)" : "rgba(60, 60, 255, 0.5)";
		ctx.strokeStyle = this.team === "red" ? "#ff3333" : "#3333ff";
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
	run(dt, game) {
		if (this.exploded) return false;
		this.growthSpeed += EBallon.GROWTH_ACCELERATION * dt;
		this.radius += this.growthSpeed * dt;
		if (this.detectsEnemy(game)) {
			game.damageAllInRadius(this.x, this.y, this.radius + EBallon.PADDING, this.team, EBallon.DAMAGE, { spareTurrets: true });
			this.exploded = true;
		}
		return true;
	}
	getTeam() {
		return this.team;
	}
};
/**
* A high-HP troop that walks toward the nearest enemy turret and dies on
* contact, dealing damage to it.
*/
var ETank = class ETank extends AbstractEntity {
	team;
	hp;
	static MAX_HP = 400;
	static SPEED = 250;
	static RADIUS = 50;
	static TURRET_DAMAGE = 25;
	constructor(x, y, team, hp = ETank.MAX_HP) {
		super(x, y);
		this.team = team;
		this.hp = hp;
	}
	/** In-game factory: spawns a fresh, full-HP tank for `team`. */
	static create(x, y, team) {
		return new ETank(x, y, team);
	}
	getType() {
		return "tank";
	}
	save() {
		return {
			hp: this.hp,
			redTeam: this.team === "red"
		};
	}
	hit(amount) {
		this.hp -= amount;
	}
	draw(ctx) {
		const BAR_W = 80;
		const BAR_H = 10;
		ctx.save();
		ctx.fillStyle = this.team;
		ctx.beginPath();
		ctx.arc(this.x, this.y, ETank.RADIUS, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = 10;
		ctx.stroke();
		ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
		ctx.fillRect(this.x - BAR_W / 2, this.y - ETank.RADIUS - 15, BAR_W, BAR_H);
		ctx.fillStyle = "#22cc22";
		ctx.fillRect(this.x - BAR_W / 2, this.y - ETank.RADIUS - 15, BAR_W * (this.hp / ETank.MAX_HP), BAR_H);
		ctx.restore();
	}
	run(dt, game) {
		if (this.hp <= 0) return false;
		const target = game.nearestEnemyTurret(this.x, this.y, this.team);
		if (!target) return true;
		const dx = target.x - this.x;
		const dy = target.y - this.y;
		const dist2 = norm2(dx, dy);
		if (dist2 <= ETank.RADIUS * ETank.RADIUS) {
			target.hit(ETank.TURRET_DAMAGE, this.team);
			return false;
		}
		const dist = Math.sqrt(dist2);
		this.x += dx / dist * ETank.SPEED * dt;
		this.y += dy / dist * ETank.SPEED * dt;
		return true;
	}
	getTeam() {
		return this.team;
	}
	getRadius() {
		return ETank.RADIUS;
	}
};
/**
* A low-HP troop that walks toward the nearest friendly turret and, on
* contact, grants it a fast-attack buff for a limited duration.
*/
var EBooster = class EBooster extends AbstractEntity {
	team;
	hp;
	static MAX_HP = 300;
	static SPEED = 350;
	static RADIUS = 30;
	static BUFF_ADDER = .5;
	static FRAME_DAMAGES = 30;
	constructor(x, y, team, hp = EBooster.MAX_HP) {
		super(x, y);
		this.team = team;
		this.hp = hp;
	}
	/** In-game factory: spawns a fresh, full-HP, unattached booster for `team`. */
	static create(x, y, team) {
		return new EBooster(x, y, team);
	}
	getType() {
		return "booster";
	}
	save() {
		return {
			hp: this.hp,
			redTeam: this.team === "red"
		};
	}
	hit(amount) {
		this.hp -= amount;
	}
	draw(ctx) {
		ctx.save();
		ctx.fillStyle = this.team;
		ctx.strokeStyle = "#ffcc00";
		ctx.lineWidth = 10;
		ctx.beginPath();
		ctx.arc(this.x, this.y, EBooster.RADIUS, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
	nearestFriendlyTurret(game) {
		let best = null;
		let bestDist = Infinity;
		for (const t of game.turrets) {
			if (t.team !== this.team) continue;
			const d = Math.hypot(t.x - this.x, t.y - this.y);
			if (d < bestDist) {
				bestDist = d;
				best = t;
			}
		}
		return best;
	}
	run(dt, game) {
		if (this.hp <= 0) return false;
		const target = this.nearestFriendlyTurret(game);
		if (!target) return true;
		const dx = target.x - this.x;
		const dy = target.y - this.y;
		const dist2 = norm2(dx, dy);
		if (dist2 <= EBooster.RADIUS * EBooster.RADIUS) {
			target.applyFastAttackEffect(EBooster.BUFF_ADDER);
			this.hp -= dt * EBooster.FRAME_DAMAGES;
			return this.hp > 0;
		}
		const dist = Math.sqrt(dist2);
		this.x += dx / dist * EBooster.SPEED * dt;
		this.y += dy / dist * EBooster.SPEED * dt;
		return true;
	}
	getTeam() {
		return this.team;
	}
	getRadius() {
		return EBooster.RADIUS;
	}
};
/**
* Attached to the player who threw it. Grants invincibility and a speed
* boost for Star.DURATION, re-applied every frame like a Booster buff.
*/
var EStar = class EStar extends AbstractEntity {
	playerIdx;
	timer;
	static SPEED_MULTIPLIER = 1.6;
	constructor(x, y, playerIdx, timer = STAR_DURATION) {
		super(x, y);
		this.playerIdx = playerIdx;
		this.timer = timer;
	}
	/** In-game factory: attaches a fresh star buff to `playerIdx`. */
	static create(x, y, playerIdx) {
		return new EStar(x, y, playerIdx);
	}
	getType() {
		return "star";
	}
	draw(ctx) {}
	save() {
		return {
			playerIdx: this.playerIdx,
			timer: this.timer
		};
	}
	run(dt, game) {
		const player = game.players[this.playerIdx];
		if (!player || !player.isAlive() || this.timer <= 0) return false;
		player.invincible = true;
		player.speedMultiplier = Math.max(player.speedMultiplier, EStar.SPEED_MULTIPLIER);
		this.x = player.x;
		this.y = player.y;
		this.timer -= dt;
		player.starDuration = Math.max(player.starDuration, this.timer);
		return this.timer > 0;
	}
	getTeam() {
		return null;
	}
};
/**
* A visible trap zone. If touched by an enemy it explodes, damaging enemies
* in a wider radius. There is only ever one kind of trap entity: TrapI,
* TrapII and TrapIII are ITEMS that all spawn the exact same ETrap - they
* only differ in which item is handed back to the player once used (see the
* Trap item chain further down).
*/
var ETrap = class ETrap extends AbstractEntity {
	team;
	triggered;
	static TRIGGER_RADIUS = 160;
	static EXPLOSION_RADIUS = 260;
	static DAMAGE = 250;
	constructor(x, y, team, triggered = false) {
		super(x, y);
		this.team = team;
		this.triggered = triggered;
	}
	/** In-game factory: drops a fresh, untriggered trap for `team`. */
	static create(x, y, team) {
		return new ETrap(x, y, team);
	}
	getType() {
		return "trap";
	}
	save() {
		return {
			redTeam: this.team === "red",
			triggered: this.triggered
		};
	}
	touchedByEnemy(game) {
		for (const p of game.players) if (p.isAlive() && p.team !== this.team && Math.hypot(p.x - this.x, p.y - this.y) <= ETrap.TRIGGER_RADIUS) return true;
		return false;
	}
	draw(ctx) {
		const color = this.team === "red" ? "#ff5555" : "#5555ff";
		ctx.save();
		ctx.strokeStyle = color;
		ctx.globalAlpha = .35;
		ctx.setLineDash([10, 10]);
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(this.x, this.y, ETrap.EXPLOSION_RADIUS, 0, Math.PI * 2);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.globalAlpha = .6;
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(this.x, this.y, ETrap.TRIGGER_RADIUS, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
	run(dt, game) {
		if (this.triggered) return false;
		if (this.touchedByEnemy(game)) {
			game.damageAllInRadius(this.x, this.y, ETrap.EXPLOSION_RADIUS, this.team, ETrap.DAMAGE, { spareTurrets: false });
			this.triggered = true;
		}
		return true;
	}
	getTeam() {
		return this.team;
	}
};
/**
* Maps every EntityType to a factory that rebuilds the runtime entity
* straight from its decoded, type-specific fields (the payload produced by
* that same entity's save()). Used only when loading a snapshot from the
* network - see deserializeEntity() and GMTurrets.load().
*/
var entityConstructors = {
	lifeSlider: (x, y, obj) => new ELifeSlider(x, y, obj.vx, obj.vy, obj.radius),
	shieldSlider: (x, y, obj) => new EShieldSlider(x, y, obj.vx, obj.vy, obj.radius, obj.redTeam ? "red" : "blue"),
	wall: (x, y, obj) => new EWall(x, y, obj.timer),
	ballon: (x, y, obj) => new EBallon(x, y, obj.redTeam ? "red" : "blue", obj.radius, obj.growthSpeed, obj.exploded),
	tank: (x, y, obj) => new ETank(x, y, obj.redTeam ? "red" : "blue", obj.hp),
	booster: (x, y, obj) => new EBooster(x, y, obj.redTeam ? "red" : "blue", obj.hp),
	star: (x, y, obj) => new EStar(x, y, obj.playerIdx, obj.timer),
	trap: (x, y, obj) => new ETrap(x, y, obj.redTeam ? "red" : "blue", obj.triggered)
};
/**
* Converts a runtime entity into the wire shape described by the `Entity`
* message: x/y plus the oneof `etype` field named after the entity's own
* type, holding its type-specific payload. Since the protobuf field names
* match EntityType exactly, this binds automatically - no switch needed.
*/
function serializeEntity(e) {
	return {
		x: e.x,
		y: e.y,
		[e.getType()]: e.save()
	};
}
/**
* Rebuilds a runtime entity from a decoded `Entity` protobuf message.
* `msg.etype` is the virtual field protobufjs generates for a `oneof`: a
* string naming whichever member is currently set (e.g. "lifeSlider",
* "trap"...). That name is both the EntityType and the payload's key, so it
* picks the right factory and the right payload in one go.
*/
function deserializeEntity(msg) {
	const type = msg.etype;
	const ctor = entityConstructors[type];
	if (!ctor) throw new Error(`deserializeEntity: unrecognized etype "${type}"`);
	return ctor(msg.x, msg.y, msg[type]);
}
var ItemInMap = class ItemInMap {
	x;
	y;
	id;
	static RADIUS = 40;
	constructor(x, y, id) {
		this.x = x;
		this.y = y;
		this.id = id;
	}
	/**
	* Draws the item on the map using its icon or a fallback shape.
	*/
	draw(ctx, imageLoader) {
		const itemDef = ITEMS[this.id];
		if (!itemDef) return;
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.fillStyle = "#ddd";
		ctx.fillRect(-ItemInMap.RADIUS, -ItemInMap.RADIUS, ItemInMap.RADIUS * 2, ItemInMap.RADIUS * 2);
		ctx.drawImage(imageLoader.get(itemDef.iconMap), -ItemInMap.RADIUS, -ItemInMap.RADIUS, ItemInMap.RADIUS * 2, ItemInMap.RADIUS * 2);
		ctx.restore();
	}
};
var ITEM_IDS = {
	LifeSlider: 0,
	ShieldSlider: 1,
	Wall: 2,
	Ballon: 3,
	Tank: 4,
	Booster: 5,
	Star: 6,
	TrapIII: 7,
	TrapII: 8,
	TrapI: 9
};
var ITEMS = [
	{
		iconMap: "lifeSlider",
		iconHand: "lifeSlider",
		name: "LifeSlider",
		run: (game, owner, dx, dy) => {
			game.entities.push(ELifeSlider.create(owner.x, owner.y, dx, dy));
			return null;
		}
	},
	{
		iconMap: "shieldSlider",
		iconHand: "shieldSlider",
		name: "ShieldSlider",
		run: (game, owner, dx, dy) => {
			game.entities.push(EShieldSlider.create(owner.x, owner.y, dx, dy, owner.team));
			return null;
		}
	},
	{
		iconMap: "wall",
		iconHand: "wall",
		name: "Wall",
		run: (game, owner, dx, dy) => {
			game.entities.push(EWall.create(owner.x, owner.y));
			return null;
		}
	},
	{
		iconMap: "ballon",
		iconHand: "ballon",
		name: "Ballon",
		run: (game, owner, dx, dy) => {
			game.entities.push(EBallon.create(owner.x, owner.y, owner.team));
			return null;
		}
	},
	{
		iconMap: "tank",
		iconHand: "tank",
		name: "Tank",
		run: (game, owner, dx, dy) => {
			game.entities.push(ETank.create(owner.x, owner.y, owner.team));
			return null;
		}
	},
	{
		iconMap: "booster",
		iconHand: "booster",
		name: "Booster",
		run: (game, owner, dx, dy) => {
			game.entities.push(EBooster.create(owner.x, owner.y, owner.team));
			return null;
		}
	},
	{
		iconMap: "none",
		iconHand: "none",
		name: "Star",
		run: (game, owner, dx, dy) => {
			const ownerIdx = game.players.indexOf(owner);
			game.entities.push(EStar.create(owner.x, owner.y, ownerIdx));
			return null;
		}
	},
	{
		iconMap: "trap",
		iconHand: "trap",
		name: "TrapIII",
		run: (game, owner, dx, dy) => {
			game.entities.push(ETrap.create(owner.x, owner.y, owner.team));
			return ITEM_IDS.TrapII;
		}
	},
	{
		iconMap: "trap",
		iconHand: "trap",
		name: "TrapII",
		run: (game, owner, dx, dy) => {
			game.entities.push(ETrap.create(owner.x, owner.y, owner.team));
			return ITEM_IDS.TrapI;
		}
	},
	{
		iconMap: "trap",
		iconHand: "trap",
		name: "TrapI",
		run: (game, owner, dx, dy) => {
			game.entities.push(ETrap.create(owner.x, owner.y, owner.team));
			return null;
		}
	}
];
var Camera = class Camera {
	x = 0;
	y = 0;
	static SCALE = .7;
	static DURATION = .3;
	startX = 0;
	startY = 0;
	targetX = 0;
	targetY = 0;
	isTransitioning = false;
	t = 0;
	/**
	* Smooth easing function mapping [0, 1] to [0, 1].
	*/
	easing(t) {
		const clampedT = Math.max(0, Math.min(1, t));
		return clampedT * clampedT * (3 - 2 * clampedT);
	}
	/**
	* Returns the center coordinates of the zone containing the given position.
	*/
	getZoneCenter(px, py) {
		let zx = Math.round(px / FULL_ROOM_SIZE);
		let zy = Math.round(py / FULL_ROOM_SIZE);
		zx = Math.max(-2, Math.min(2, zx));
		zy = Math.max(-2, Math.min(2, zy));
		return {
			cx: zx * FULL_ROOM_SIZE,
			cy: zy * FULL_ROOM_SIZE
		};
	}
	/**
	* Clamps a value between a minimum and maximum value.
	*/
	clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}
	update(px, py, dt) {
		const { cx, cy } = this.getZoneCenter(px, py);
		if (cx !== this.targetX || cy !== this.targetY) {
			this.startX = this.x;
			this.startY = this.y;
			this.targetX = cx;
			this.targetY = cy;
			this.t = 0;
			this.isTransitioning = true;
		}
		const viewHalfW = WIDTH / (2 * Camera.SCALE);
		const viewHalfH = HEIGHT / (2 * Camera.SCALE);
		const minX = this.targetX - FULL_ROOM_SIZE / 2 + viewHalfW;
		const maxX = this.targetX + FULL_ROOM_SIZE / 2 - viewHalfW;
		const minY = this.targetY - FULL_ROOM_SIZE / 2 + viewHalfH;
		const maxY = this.targetY + FULL_ROOM_SIZE / 2 - viewHalfH;
		const desiredX = this.clamp(px, minX, maxX);
		const desiredY = this.clamp(py, minY, maxY);
		if (this.isTransitioning) {
			this.t += dt;
			if (this.t >= Camera.DURATION) {
				this.isTransitioning = false;
				this.x = desiredX;
				this.y = desiredY;
			} else {
				const progress = this.easing(this.t / Camera.DURATION);
				this.x = this.startX + (desiredX - this.startX) * progress;
				this.y = this.startY + (desiredY - this.startY) * progress;
			}
		} else {
			this.x = desiredX;
			this.y = desiredY;
		}
	}
	teleport(px, py) {
		const { cx, cy } = this.getZoneCenter(px, py);
		this.targetX = cx;
		this.targetY = cy;
		const viewHalfW = WIDTH / (2 * Camera.SCALE);
		const viewHalfH = HEIGHT / (2 * Camera.SCALE);
		const minX = cx - FULL_ROOM_SIZE / 2 + viewHalfW;
		const maxX = cx + FULL_ROOM_SIZE / 2 - viewHalfW;
		const minY = cy - FULL_ROOM_SIZE / 2 + viewHalfH;
		const maxY = cy + FULL_ROOM_SIZE / 2 - viewHalfH;
		this.x = this.clamp(px, minX, maxX);
		this.y = this.clamp(py, minY, maxY);
		this.isTransitioning = false;
		this.t = 0;
	}
	getCoords() {
		return {
			x: this.x,
			y: this.y
		};
	}
};
var ClientData = class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;
	html;
	time;
	camera = new Camera();
	clientWasDead = true;
	lastDirX = 0;
	lastDirY = 0;
	attackPressStart = null;
	attackHasAimed = false;
	playerAngles = {};
	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-turrets-root");
		this.time = document.createElement("div");
		this.time.classList.add("game-turrets-time");
		this.html.appendChild(this.time);
	}
	static showTime(time) {
		return `${Math.floor(time / 60)}:${(time % 60).toFixed(1).padStart(4, "0")}`;
	}
	update(game, playerIdx) {
		this.time.innerText = ClientData.showTime(game.time);
		const player = game.players[playerIdx];
		if (this.clientWasDead && player.alive < 0) this.camera.teleport(player.x, player.y);
		this.clientWasDead = player.alive >= 0;
		this.camera.update(player.x, player.y, 1 / 60);
	}
};
var TutorialData = class {
	game;
	step = 0;
	wakeUp = 0;
	constructor(game) {
		this.game = game;
	}
	frame(dt, clock) {
		this.game.players[0];
		this.game.players[1];
		return "Placeholder";
	}
};
function generateClientDom() {
	return {
		skin: 0,
		preferTeam: 0,
		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		}
	};
}
/**
* Renders a single inventory slot card in the HUD.
*
* @param ctx - The 2D rendering context.
* @param x - Top-left X coordinate of the slot card.
* @param y - Top-left Y coordinate of the slot card.
* @param size - Size (width and height) of the slot card.
* @param itemId - The ID of the item inside this slot (-1 if empty).
* @param slotIndex - Display number for keybinding (1, 2, 3).
* @param isSelected - True if the player currently selected this slot.
* @param imageLoader - Image assets container.
*/
function drawItemHand(ctx, x, y, size, itemId, slotIndex, isSelected, imageLoader) {
	ctx.save();
	ctx.fillStyle = isSelected ? "#ffcc00" : "rgba(30, 30, 30, 0.75)";
	ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.4)";
	ctx.lineWidth = isSelected ? 4 : 2;
	ctx.fillRect(x, y, size, size);
	ctx.strokeRect(x, y, size, size);
	if (itemId !== -1 && ITEMS[itemId]) {
		const itemDef = ITEMS[itemId];
		const img = imageLoader.get(itemDef.iconHand);
		const padding = size * .15;
		const imgSize = size - padding * 2;
		if (img) ctx.drawImage(img, x + padding, y + padding, imgSize, imgSize);
		else {
			ctx.fillStyle = isSelected ? "#000000" : "#ffffff";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = "bold 18px sans-serif";
			ctx.fillText(itemDef.name.charAt(0), x + size / 2, y + size / 2);
		}
	}
	ctx.fillStyle = isSelected ? "#000000" : "#ffffff";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.font = "bold 16px sans-serif";
	ctx.fillText(`${slotIndex}`, x + 6, y + 4);
	ctx.restore();
}
var GMTurrets = class GMTurrets extends GameMode {
	static types = {
		Player,
		Turret
	};
	static DATA = {
		GRAVITY,
		WIDTH,
		HEIGHT
	};
	players;
	turrets = [];
	floors = [];
	bullets = [];
	itemsInMap = [];
	entities = [];
	time = 600;
	redScore = 0;
	blueScore = 0;
	finished = false;
	internalFrameTick = 0;
	cycleStep = 0;
	constructor(total) {
		super();
		this.players = Array.from({ length: total }, () => new Player(0, 0));
		for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
			this.turrets.push(new Turret(x * FULL_ROOM_SIZE, y * FULL_ROOM_SIZE, SPAWN_COLORS[y + 2][x + 2]));
			const floorX = x * FULL_ROOM_SIZE;
			const floorY = y * FULL_ROOM_SIZE;
			this.floors.push({
				x0: floorX - ROOM_SIZE / 2,
				y0: floorY - ROOM_SIZE / 2,
				x1: floorX + ROOM_SIZE / 2,
				y1: floorY + ROOM_SIZE / 2
			});
			if (x < 2) this.floors.push({
				x0: floorX + ROOM_SIZE / 2,
				y0: floorY - BRIDGE_SIZE / 2,
				x1: floorX + FULL_ROOM_SIZE - ROOM_SIZE / 2,
				y1: floorY + BRIDGE_SIZE / 2
			});
			if (y < 2) this.floors.push({
				x0: floorX - BRIDGE_SIZE / 2,
				y0: floorY + ROOM_SIZE / 2,
				x1: floorX + BRIDGE_SIZE / 2,
				y1: floorY + FULL_ROOM_SIZE - ROOM_SIZE / 2
			});
		}
	}
	static async createServ(players, total, hasSkin) {
		const { StartData, StartDataClient } = protocols.get();
		const game = new GMTurrets(total);
		function decode(i) {
			if (i < players.length) return decodeFullMessage(StartData.decode(players[i].data));
			return generateClientDom();
		}
		const playerInfos = game.players.map((p, i) => ({
			player: p,
			index: i,
			pref: decode(i).preferTeam ?? 0
		}));
		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);
		const assigned = new Array(totalPlayers);
		let redCount = 0;
		let blueCount = 0;
		for (let i = 0; i < totalPlayers; i++) {
			const info = playerInfos[i];
			if (info.pref === 1 && redCount < maxPerTeam) {
				assigned[info.index] = true;
				redCount++;
			} else if (info.pref === -1 && blueCount < maxPerTeam) {
				assigned[info.index] = false;
				blueCount++;
			}
		}
		for (let i = 0; i < totalPlayers; i++) {
			if (assigned[i] !== void 0) continue;
			if ((redCount < blueCount || redCount === blueCount && i % 2 === 0) && redCount < maxPerTeam) {
				assigned[i] = true;
				redCount++;
			} else {
				assigned[i] = false;
				blueCount++;
			}
		}
		for (const [i, p] of game.players.entries()) {
			const redTeam = assigned[i];
			p.initSpawn(0, redTeam ? -12e3 : FULL_ROOM_SIZE * 2, redTeam ? "red" : "blue");
		}
		return {
			game,
			data: StartDataClient.encode({ players: game.players.map((p) => ({
				x: p.spawnX,
				y: p.spawnY,
				isRed: p.team === "red"
			})) }).finish()
		};
	}
	static createClient(data, total) {
		const game = new GMTurrets(total);
		const { StartDataClient } = protocols.get();
		if (data) {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
			for (const [idx, p] of players.entries()) game.players[idx].initSpawn(p.x, p.y, p.isRed ? "red" : "blue");
		} else {
			game.players[0].initSpawn(0, -200, "red");
			game.players[1].initSpawn(0, 200, "blue");
		}
		const clientData = new ClientData();
		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: {}
		};
	}
	static generateClientDom = generateClientDom;
	static TEXTURES = {
		"player-blue": "/assets/games/turrets/player-blue.png",
		"player-red": "/assets/games/turrets/player-red.png",
		"turret": "/assets/games/turrets/turret.png",
		"ballon": "/assets/games/turrets/items/ballon.png",
		"booster": "/assets/games/turrets/items/booster.png",
		"lifeSlider": "/assets/games/turrets/items/lifeSlider.png",
		"shieldSlider": "/assets/games/turrets/items/shieldSlider.png",
		"star": "/assets/games/turrets/items/star.png",
		"tank": "/assets/games/turrets/items/tank.png",
		"trap": "/assets/games/turrets/items/trap.png",
		"wall": "/assets/games/turrets/items/wall.png"
	};
	init() {}
	getBotIds(count) {
		return Array.from({ length: count }, () => 0);
	}
	run(dt, produceFinish) {
		this.time -= dt;
		if (this.time <= 0 || this.redScore + this.blueScore >= this.turrets.length) this.finished = true;
		this.resetEffects();
		this.runEntities(dt);
		for (const turret of this.turrets) turret.frame(dt, this);
		for (const [idx, p] of this.players.entries()) {
			p.move(dt);
			p.avoidOutOfFloor(this.floors);
			p.attackLogic(dt, idx, this);
		}
		for (let i = this.bullets.length - 1; i >= 0; i--) {
			const b = this.bullets[i];
			if (b.move(dt) || b.attack(this)) this.bullets.splice(i, 1);
		}
		if (produceFinish && this.finished) return this.produceFinish();
		return null;
	}
	/**
	* Wipes the per-frame effects of every player and turret. Must run
	* before runEntities(), so that active entities can re-apply theirs.
	*/
	resetEffects() {
		for (const p of this.players) p.resetEffects();
		for (const t of this.turrets) t.resetEffects();
	}
	/**
	* Advances every entity by dt, dropping the ones whose run() returns
	* false (expired, exploded, consumed, died...).
	*/
	runEntities(dt) {
		for (let i = this.entities.length - 1; i >= 0; i--) if (!this.entities[i].run(dt, this)) this.entities.splice(i, 1);
	}
	/**
	* True once (x, y) - inflated by `margin` - has fully left the map.
	* Used by the sliders to know when to disappear.
	*/
	isOOB(x, y, margin = 0) {
		const limit = FULL_ROOM_SIZE * 3;
		return x < -18e3 - margin || x > limit + margin || y < -18e3 - margin || y > limit + margin;
	}
	/**
	* True if (x, y) currently sits inside an ELifeSlider (protects
	* everyone) or an EShieldSlider of the given team (protects only its
	* own team). Checked by Bullet.attack() before applying player damage.
	*/
	isInsideNoDamageZone(x, y, radius, team) {
		for (const e of this.entities) {
			if (e instanceof ELifeSlider && e.protects(x, y, radius, team)) return true;
			if (e instanceof EShieldSlider && e.protects(x, y, radius, team)) return true;
		}
		return false;
	}
	/**
	* True if (x, y) sits inside an EWall's square. Checked by
	* Bullet.attack() to stop bullets outright.
	*/
	isBlockedByWall(x, y) {
		for (const e of this.entities) if (e instanceof EWall && e.blocksBullet(x, y)) return true;
		return false;
	}
	/**
	* Closest captured turret NOT belonging to `team`, or null if none.
	* Used by ETank to find where to charge.
	*/
	nearestEnemyTurret(x, y, team) {
		let best = null;
		let bestDist = Infinity;
		for (const t of this.turrets) {
			if (t.team === null || t.team === team) continue;
			const d = Math.hypot(t.x - x, t.y - y);
			if (d < bestDist) {
				bestDist = d;
				best = t;
			}
		}
		return best;
	}
	/**
	* Iterator over every player / turret / entity that can currently take
	* damage - used by damageAllInRadius() for area-effect entities
	* (EBallon, ETrap).
	*/
	*damageableEntities() {
		for (const p of this.players) {
			if (!p.isAlive()) continue;
			yield [p, "player"];
		}
		for (const t of this.turrets) yield [t, "turret"];
		for (const e of this.entities) if (e instanceof ETank || e instanceof EBooster) yield [e, "entity"];
	}
	/**
	* Applies `damage` to every damageable thing of the opposite team to
	* `sourceTeam` within `radius` of (x, y). Respects no-damage zones.
	* Used by EBallon (spareTurrets: true) and ETrap (spareTurrets: false).
	*/
	damageAllInRadius(x, y, radius, sourceTeam, damage, options) {
		for (const [target, kind] of this.damageableEntities()) {
			const team = target.getTeam();
			if (team === sourceTeam || team === null || options.spareTurrets && kind === "turret" || Math.hypot(target.x - x, target.y - y) > radius || this.isInsideNoDamageZone(target.x, target.y, target.getRadius(), team)) continue;
			if (kind === "player") target.hit(damage, null);
			else target.hit(damage, sourceTeam);
		}
	}
	runInput(playerIdx, input) {
		const player = this.players[playerIdx];
		switch (input.action) {
			case "dirX":
				player.dirX = input.dirX;
				break;
			case "dirY":
				player.dirY = input.dirY;
				break;
			case "throwTarget":
				player.target = {
					type: "fixed",
					x: input.throwTarget.x,
					y: input.throwTarget.y
				};
				break;
			case "throwDir":
				player.target = {
					type: "delta",
					dx: input.throwDir.x,
					dy: input.throwDir.y
				};
				break;
			case "throwAuto":
				player.target = { type: "auto" };
				break;
			case "throwOff":
				player.target = null;
				break;
			case "useItem": if (input.useItem && input.useItem.slot !== void 0) player.interactWithSlot(input.useItem.slot, this);
		}
	}
	collectInputs(keyboard, mouse, mobile, _data) {
		const data = _data;
		const throwTarget = mouse.getCoords();
		data.mouseX = throwTarget.x;
		data.mouseY = throwTarget.y;
		const inputs = [];
		if (mobile) {
			const move = mobile.getJoystick("move");
			if (move.x !== data.lastDirX) {
				inputs.push({
					action: "dirX",
					dirX: move.x
				});
				data.lastDirX = move.x;
			}
			if (move.y !== data.lastDirY) {
				inputs.push({
					action: "dirY",
					dirY: move.y
				});
				data.lastDirY = move.y;
			}
			const attack = mobile.getJoystick("attack");
			const QUICK_TAP_MS = 180;
			if (mobile.press("attack")) {
				if (data.attackPressStart === null) {
					data.attackPressStart = performance.now();
					data.attackHasAimed = false;
				}
				data.attackHasAimed = true;
				inputs.push({
					throwDir: {
						x: attack.x,
						y: attack.y
					},
					action: "throwDir"
				});
			} else if (data.attackPressStart !== null) {
				const heldFor = performance.now() - data.attackPressStart;
				if (!data.attackHasAimed && heldFor < QUICK_TAP_MS) inputs.push({
					throwAuto: {},
					action: "throwAuto"
				});
				else inputs.push({
					throwOff: {},
					action: "throwOff"
				});
				data.attackPressStart = null;
				data.attackHasAimed = false;
			}
			for (let slot = 0; slot < ITEM_COUNT; slot++) if (mobile.first(String(slot + 1))) inputs.push({
				useItem: { slot },
				action: "useItem"
			});
		} else {
			if (keyboard.press("right")) {
				if (data.lastDirX !== 1) {
					inputs.push({
						action: "dirX",
						dirX: 1
					});
					data.lastDirX = 1;
				}
			} else if (keyboard.press("left")) {
				if (data.lastDirX !== -1) {
					inputs.push({
						action: "dirX",
						dirX: -1
					});
					data.lastDirX = -1;
				}
			} else if (data.lastDirX !== 0) {
				inputs.push({
					action: "dirX",
					dirX: 0
				});
				data.lastDirX = 0;
			}
			if (keyboard.press("down")) {
				if (data.lastDirY !== 1) {
					inputs.push({
						action: "dirY",
						dirY: 1
					});
					data.lastDirY = 1;
				}
			} else if (keyboard.press("up")) {
				if (data.lastDirY !== -1) {
					inputs.push({
						action: "dirY",
						dirY: -1
					});
					data.lastDirY = -1;
				}
			} else if (data.lastDirY !== 0) {
				inputs.push({
					action: "dirY",
					dirY: 0
				});
				data.lastDirY = 0;
			}
			if (mouse.press(0)) inputs.push({
				throwTarget,
				action: "throwTarget"
			});
			else if (mouse.killed(0)) inputs.push({
				throwOff: {},
				action: "throwOff"
			});
			if (keyboard.first("shift")) inputs.push({
				throwAuto: {},
				action: "throwAuto"
			});
			for (let slot = 0; slot < ITEM_COUNT; slot++) if (keyboard.first(String(slot + 1))) inputs.push({
				useItem: { slot },
				action: "useItem"
			});
		}
		return inputs;
	}
	drawMinimap(ctx, playerIdx) {
		const mapWidth = FULL_ROOM_SIZE * 5;
		const mapHeight = FULL_ROOM_SIZE * 5;
		const MINIMAP_SIZE = WIDTH * MINIMAP_RATIO;
		ctx.save();
		ctx.translate(MINIMAP_X, MINIMAP_Y);
		ctx.scale(MINIMAP_SIZE / mapWidth, MINIMAP_SIZE / mapHeight);
		ctx.translate(mapWidth / 2, mapHeight / 2);
		ctx.fillStyle = "rgba(50, 50, 50, 0.7)";
		ctx.fillRect(-15e3, -15e3, mapWidth, mapHeight);
		for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
			const cellX = -15e3 + x * FULL_ROOM_SIZE;
			const cellY = -15e3 + y * FULL_ROOM_SIZE;
			const turret = this.turrets[y * 5 + x];
			let r;
			let g;
			let b;
			if (turret.team === "red") {
				r = 255;
				g = 0;
				b = 0;
			} else if (turret.team === "blue") {
				r = 0;
				g = 0;
				b = 255;
			} else continue;
			ctx.fillStyle = `rgb(${r}, ${g}, ${b}, 0.35)`;
			ctx.fillRect(cellX, cellY, FULL_ROOM_SIZE, FULL_ROOM_SIZE);
			if (turret.itemLoadingTimer > 0 && turret.fullLoadingTimer > 0) {
				const s = (turret.fullLoadingTimer - turret.itemLoadingTimer) * (FULL_ROOM_SIZE / turret.fullLoadingTimer);
				ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`;
				ctx.fillRect(cellX + FULL_ROOM_SIZE / 2 - s / 2, cellY + FULL_ROOM_SIZE / 2 - s / 2, s, s);
			}
		}
		ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
		ctx.lineWidth = 1 / (MINIMAP_SIZE / mapWidth);
		for (let x = 1; x < 5; x++) {
			const px = -15e3 + x * FULL_ROOM_SIZE;
			ctx.beginPath();
			ctx.moveTo(px, -15e3);
			ctx.lineTo(px, mapHeight / 2);
			ctx.stroke();
		}
		for (let y = 1; y < 5; y++) {
			const py = -15e3 + y * FULL_ROOM_SIZE;
			ctx.beginPath();
			ctx.moveTo(-15e3, py);
			ctx.lineTo(mapWidth / 2, py);
			ctx.stroke();
		}
		ctx.fillStyle = "#f0f";
		for (const item of this.itemsInMap) {
			ctx.beginPath();
			ctx.arc(item.x, item.y, 175, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.strokeStyle = "black";
		ctx.lineWidth = 10;
		for (const turret of this.turrets) {
			ctx.fillStyle = turret.team ?? "green";
			ctx.beginPath();
			ctx.arc(turret.x, turret.y, 215, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.arc(turret.x, turret.y, TURRET_RADIUS, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.strokeStyle = "white";
		ctx.lineWidth = 100;
		for (const [idx, player] of this.players.entries()) {
			ctx.fillStyle = idx === playerIdx ? "yellow" : player.team === "red" ? "red" : "blue";
			ctx.beginPath();
			ctx.arc(player.x, player.y, idx === playerIdx ? 400 : 300, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
		ctx.restore();
		ctx.strokeStyle = "white";
		ctx.lineWidth = 2;
		ctx.strokeRect(MINIMAP_X, MINIMAP_Y, MINIMAP_SIZE, MINIMAP_SIZE);
	}
	/**
	* Draws the inventory bar at the top-left corner of the screen.
	*/
	drawInventoryHUD(ctx, player, imageLoader) {
		const startX = 30;
		const startY = 30;
		const slotSize = 70;
		for (let i = 0; i < ITEM_COUNT; i++) {
			const x = startX + i * 85;
			const itemId = player.items[i] ?? -1;
			const isSelected = player.selectedItem === i;
			drawItemHand(ctx, x, startY, slotSize, itemId, i + 1, isSelected, imageLoader);
		}
	}
	draw(ctx, playerIdx, _data, _imageLoader) {
		const imageLoader = _imageLoader.getFolder("turrets");
		ctx.imageSmoothingEnabled = false;
		const data = _data;
		if (data.firstFrame) {
			data.firstFrame = false;
			imageLoader.setColorRule("turret", 0, [{
				prev: "#6abe30",
				next: "#ff0044"
			}]);
			imageLoader.setColorRule("turret", 1, [{
				prev: "#6abe30",
				next: "#0044ff"
			}]);
		}
		data.update(this, playerIdx);
		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
		const cameraCoords = data.camera.getCoords();
		ctx.save();
		ctx.translate(WIDTH / 2, HEIGHT / 2);
		ctx.scale(Camera.SCALE, Camera.SCALE);
		ctx.translate(-cameraCoords.x, -cameraCoords.y);
		ctx.fillStyle = "#777";
		for (const f of this.floors) ctx.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
		for (const turret of this.turrets) turret.drawBackground(ctx);
		for (const item of this.itemsInMap) item.draw(ctx, imageLoader);
		for (const entity of this.entities) if (!entity.drawInFront()) entity.draw(ctx, imageLoader);
		for (const b of this.bullets) {
			ctx.fillStyle = b.team === "red" ? "#ff6666" : "#6666ff";
			ctx.beginPath();
			ctx.arc(b.x, b.y, Bullet.RADIUS, 0, Math.PI * 2);
			ctx.fill();
		}
		for (const turret of this.turrets) turret.draw(ctx, imageLoader);
		for (const [idx, p] of this.players.entries()) data.playerAngles[idx] = p.draw(ctx, imageLoader, idx === playerIdx, data.playerAngles[idx] ?? 0);
		for (const entity of this.entities) if (entity.drawInFront()) entity.draw(ctx, imageLoader);
		ctx.restore();
		const localPlayer = this.players[playerIdx];
		this.drawInventoryHUD(ctx, localPlayer, imageLoader);
		if (!localPlayer.isAlive()) {
			ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
			ctx.fillRect(0, 0, WIDTH, HEIGHT);
			ctx.fillStyle = "white";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = "bold 80px sans-serif";
			ctx.fillText("YOU DIED", WIDTH / 2, HEIGHT / 2 - 40);
			ctx.font = "40px sans-serif";
			ctx.fillText(`Respawn in ${localPlayer.alive.toFixed(1)}s`, WIDTH / 2, 715);
		}
		this.drawMinimap(ctx, playerIdx);
	}
	onDisconnection(id) {
		this.players[id].connected = false;
	}
	save() {
		const { State } = protocols.get();
		const object = {
			players: this.players,
			turrets: this.turrets.map((t) => ({
				taken: t.team !== null,
				redTeam: t.team === "red",
				activation: t.activation,
				hp: t.hp,
				itemDamage: t.itemDamage,
				itemLoadingTimer: t.itemLoadingTimer,
				fullLoadingTimer: t.fullLoadingTimer,
				startCooldown: t.startCooldown,
				attackCooldown: t.attackCooldown,
				itemsToSpawn: t.itemsToSpawn,
				spawnIdx: t.spawnIdx
			})),
			time: this.time,
			bullets: this.bullets.map((b) => ({
				x: b.x,
				y: b.y,
				vx: b.vx,
				vy: b.vy,
				a: b.a,
				isRed: b.team === "red",
				owner: b.owner
			})),
			items: this.itemsInMap,
			entities: this.entities.map(serializeEntity),
			cycleStep: this.cycleStep
		};
		return State.encode(object).finish();
	}
	load(data) {
		const { State } = protocols.get();
		const obj = State.decode(data);
		for (const [idx, player] of obj.players.entries()) this.players[idx].load(player);
		for (const [idx, turret] of obj.turrets.entries()) this.turrets[idx].load(turret);
		this.bullets.length = 0;
		if (obj.bullets) for (const b of obj.bullets) this.bullets.push(new Bullet(b.x, b.y, b.vx, b.vy, b.a, b.isRed ? "red" : "blue", b.owner));
		this.itemsInMap.length = 0;
		if (obj.items) for (const item of obj.items) this.itemsInMap.push(new ItemInMap(item.x, item.y, item.id));
		this.entities.length = 0;
		if (obj.entities) for (const e of obj.entities) this.entities.push(deserializeEntity(e));
		this.time = obj.time;
		this.cycleStep = obj.cycleStep;
	}
	getSize() {
		return {
			width: WIDTH,
			height: HEIGHT
		};
	}
	evalMouseCoords(x, y, playerIdx, _clientData) {
		const clientData = _clientData;
		const cameraCoords = clientData.camera.getCoords();
		const ret = {
			x: (x - WIDTH / 2) / Camera.SCALE + cameraCoords.x,
			y: (y - HEIGHT / 2) / Camera.SCALE + cameraCoords.y
		};
		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;
		return ret;
	}
	getMobileDesc() {
		return {
			buttons: {
				["1"]: {
					x: 50,
					xp: "right",
					y: 180,
					yp: "bottom",
					size: 30,
					color: "#00ff00"
				},
				["2"]: {
					x: 50,
					xp: "right",
					y: 220,
					yp: "bottom",
					size: 30,
					color: "#00ff00"
				},
				["3"]: {
					x: 50,
					xp: "right",
					y: 260,
					yp: "bottom",
					size: 30,
					color: "#00ff00"
				}
			},
			joysticks: {
				move: {
					x: 100,
					xp: "left",
					y: 120,
					yp: "bottom",
					size: 80,
					color: "#00ff00"
				},
				attack: {
					x: 100,
					xp: "right",
					y: 120,
					yp: "bottom",
					size: 80,
					color: "#00ff00"
				}
			}
		};
	}
	createTutorial() {
		return new TutorialData(this);
	}
	produceFinish() {
		const redTeam = [];
		const blueTeam = [];
		const playerEqualities = [];
		for (const [idx, player] of this.players.entries()) if (player.team === "red") redTeam.push(idx);
		else blueTeam.push(idx);
		for (const team of [redTeam, blueTeam]) {
			team.sort((a, b) => this.players[b].kills - this.players[a].kills);
			for (let i = 0; i < team.length - 2; i++) if (this.players[team[i]].kills === this.players[team[i + 1]].kills) playerEqualities.push(team[i]);
		}
		let teams;
		const teamEqualities = [];
		if (this.redScore > this.blueScore) teams = [redTeam, blueTeam];
		else if (this.redScore < this.blueScore) teams = [blueTeam, redTeam];
		else {
			teams = [blueTeam, redTeam];
			teamEqualities.push(0);
		}
		return {
			results: teams,
			teamEqualities,
			playerEqualities
		};
	}
	makeCycleStep() {
		const s = this.cycleStep;
		this.cycleStep++;
		if (this.cycleStep >= ITEMS_CYCLE.length) this.cycleStep = 0;
		return s;
	}
};
//#endregion
//#region commons/gamemods.ts
var gamemods = {
	separator_competitive: {
		type: "ui-separator",
		category: "Competitive games"
	},
	test: {
		type: "multiplayer",
		server: GMTest.createServ,
		client: GMTest.createClient,
		dom: GMTest.generateClientDom,
		textures: GMTest.TEXTURES,
		name: "Test",
		computerOnly: false,
		tropheesPerPlayer: 2,
		skins: [],
		defaultPlayerCount: 4
	},
	airbasket: {
		type: "multiplayer",
		server: GMAirBasket.createServ,
		client: GMAirBasket.createClient,
		dom: GMAirBasket.generateClientDom,
		textures: GMAirBasket.TEXTURES,
		name: "Air Basket",
		tropheesPerPlayer: 20,
		computerOnly: true,
		skins: GMAirBasket.SKINS_IDS,
		defaultPlayerCount: 4
	},
	turrets: {
		type: "multiplayer",
		server: GMTurrets.createServ,
		client: GMTurrets.createClient,
		dom: GMTurrets.generateClientDom,
		textures: GMTurrets.TEXTURES,
		name: "Turrets",
		tropheesPerPlayer: 20,
		computerOnly: false,
		skins: [],
		defaultPlayerCount: 4
	},
	separator_mobile: {
		type: "ui-separator",
		category: "Mobile games"
	},
	superTicTacToe: {
		type: "multiplayer",
		server: GMSuperTicTacToe.createServ,
		client: GMSuperTicTacToe.createClient,
		dom: GMSuperTicTacToe.generateClientDom,
		textures: GMSuperTicTacToe.TEXTURES,
		name: "Super tic tac toe",
		tropheesPerPlayer: 3,
		computerOnly: false,
		skins: [],
		defaultPlayerCount: 2
	},
	separator_solo: {
		type: "ui-separator",
		category: "Solo games"
	},
	testSolo: {
		type: "solo",
		name: "Test Solo",
		computerOnly: false,
		dom: GMTestSolo.generateClientDom,
		textures: GMTestSolo.TEXTURES,
		categories: GMTestSolo.CATEGORIES,
		minFirst: GMTestSolo.MIN_FIRST,
		create: GMTestSolo.create
	}
};
function getMultiGmFactory(gamemode) {
	const factory = gamemods[gamemode];
	if (!factory || factory.type !== "multiplayer") throw new Error(`Invalid gamemode '${gamemode}'`);
	return factory;
}
function getSoloGmFactory(gamemode) {
	const factory = gamemods[gamemode];
	if (!factory || factory.type !== "solo") throw new Error(`Invalid gamemode '${gamemode}'`);
	return factory;
}
function getGmFactory(gamemode) {
	const factory = gamemods[gamemode];
	if (!factory || factory.type !== "solo" && factory.type !== "multiplayer") throw new Error(`Invalid gamemode '${gamemode}'`);
	return factory;
}
//#endregion
//#region commons/protocolLoader.ts
var protocolLoader = null;
var loadedProtocols = /* @__PURE__ */ new Map();
function getProtocol(name, type) {
	return {
		async load() {
			if (!protocolLoader) throw new Error("Protocol loader is not initialized. Call initProtocols first.");
			if (loadedProtocols.has(name)) return;
			const root = await protocolLoader(name);
			const namespace = `game_${name}`;
			let resolvedTypes;
			if (type === "multiplayer") resolvedTypes = {
				type: "multiplayer",
				ServerMessage: root.lookupType(`${namespace}.ServerMessage`),
				ClientMessage: root.lookupType(`${namespace}.ClientMessage`),
				StartData: root.lookupType(`${namespace}.StartData`),
				StartDataClient: root.lookupType(`${namespace}.StartDataClient`),
				State: root.lookupType(`${namespace}.State`),
				Input: root.lookupType(`${namespace}.Input`)
			};
			else resolvedTypes = {
				type: "solo",
				Input: root.lookupType(`${namespace}.Input`)
			};
			loadedProtocols.set(name, resolvedTypes);
		},
		get() {
			const types = loadedProtocols.get(name);
			if (!types) throw new Error(`Protocol '${name}' is not loaded. Make sure to await load() before calling get().`);
			return types;
		}
	};
}
//#endregion
//#region node_modules/alpinejs/dist/module.esm.js
var flushPending = false;
var flushing = false;
var queue = [];
var lastFlushedIndex = -1;
var queueNeedsSort = false;
var transactionActive = false;
function scheduler(callback) {
	queueJob(callback);
}
function startTransaction() {
	transactionActive = true;
}
function commitTransaction() {
	transactionActive = false;
	queueFlush();
}
function queueJob(job) {
	if (!queue.includes(job)) {
		queue.push(job);
		if (job._x_schedulerPriority !== void 0) queueNeedsSort = true;
	}
	queueFlush();
}
function dequeueJob(job) {
	let index = queue.indexOf(job);
	if (index !== -1 && index > lastFlushedIndex) queue.splice(index, 1);
}
function queueFlush() {
	if (!flushing && !flushPending) {
		if (transactionActive) return;
		flushPending = true;
		queueMicrotask(flushJobs);
	}
}
function flushJobs() {
	flushPending = false;
	flushing = true;
	for (let i = 0; i < queue.length; i++) {
		if (queueNeedsSort) sortPendingJobs(i);
		queue[i]();
		lastFlushedIndex = i;
	}
	queue.length = 0;
	lastFlushedIndex = -1;
	queueNeedsSort = false;
	flushing = false;
}
function sortPendingJobs(start2) {
	let depths = /* @__PURE__ */ new Map();
	let sorted = queue.slice(start2).sort((a, b) => compareJobs(a, b, depths));
	for (let i = 0; i < sorted.length; i++) queue[start2 + i] = sorted[i];
	queueNeedsSort = false;
}
function compareJobs(a, b, depths) {
	if (!isStructural(a)) return isStructural(b) ? 1 : 0;
	if (!isStructural(b)) return -1;
	return getElementDepth(a._x_schedulerPriority.el, depths) - getElementDepth(b._x_schedulerPriority.el, depths) || a._x_schedulerPriority.order - b._x_schedulerPriority.order;
}
function isStructural(job) {
	return job._x_schedulerPriority !== void 0;
}
function getElementDepth(el, depths) {
	if (depths.has(el)) return depths.get(el);
	let depth = 0;
	let owner = el;
	while (el) {
		depth++;
		if (el._x_teleportBack) el = el._x_teleportBack;
		else if (typeof ShadowRoot === "function" && el.parentNode instanceof ShadowRoot) el = el.parentNode.host;
		else el = el.parentElement;
	}
	depths.set(owner, depth);
	return depth;
}
var reactive;
var effect;
var release;
var raw;
var nextStructuralEffectOrder = 0;
var shouldSchedule = true;
function disableEffectScheduling(callback) {
	shouldSchedule = false;
	callback();
	shouldSchedule = true;
}
function setReactivityEngine(engine) {
	reactive = engine.reactive;
	release = engine.release;
	effect = (callback) => engine.effect(callback, { scheduler: (task) => {
		if (shouldSchedule) scheduler(task);
		else task();
	} });
	raw = engine.raw;
}
function overrideEffect(override) {
	effect = override;
}
function elementBoundEffect(el) {
	let cleanup = () => {};
	let wrappedEffect = (callback, options) => {
		let priority = options?.priority === "structural" ? nextStructuralEffectOrder++ : void 0;
		let effectReference = effect(callback);
		if (priority !== void 0 && effectReference !== void 0) effectReference._x_schedulerPriority = {
			el,
			order: priority
		};
		if (!el._x_effects) {
			el._x_effects = /* @__PURE__ */ new Set();
			el._x_runEffects = () => {
				el._x_effects.forEach((i) => i());
			};
		}
		el._x_effects.add(effectReference);
		cleanup = () => {
			if (effectReference === void 0) return;
			el._x_effects.delete(effectReference);
			release(effectReference);
		};
		return effectReference;
	};
	return [wrappedEffect, () => {
		cleanup();
	}];
}
function watch(getter, callback) {
	let firstTime = true;
	let oldValue;
	let oldValueJSON;
	let effectReference = effect(() => {
		let value = getter();
		let newJSON = JSON.stringify(value);
		if (!firstTime) {
			if (typeof value === "object" || value !== oldValue) {
				let previousValue = typeof oldValue === "object" ? JSON.parse(oldValueJSON) : oldValue;
				queueMicrotask(() => {
					callback(value, previousValue);
				});
			}
		}
		oldValue = value;
		oldValueJSON = newJSON;
		firstTime = false;
	});
	return () => release(effectReference);
}
async function transaction(callback) {
	startTransaction();
	try {
		await callback();
		await Promise.resolve();
	} finally {
		commitTransaction();
	}
}
var onAttributeAddeds = [];
var onElRemoveds = [];
var onElAddeds = [];
function onElAdded(callback) {
	onElAddeds.push(callback);
}
function onElRemoved(el, callback) {
	if (typeof callback === "function") {
		if (!el._x_cleanups) el._x_cleanups = [];
		el._x_cleanups.push(callback);
	} else {
		callback = el;
		onElRemoveds.push(callback);
	}
}
function onAttributesAdded(callback) {
	onAttributeAddeds.push(callback);
}
function onAttributeRemoved(el, name, callback) {
	if (!el._x_attributeCleanups) el._x_attributeCleanups = {};
	if (!el._x_attributeCleanups[name]) el._x_attributeCleanups[name] = [];
	el._x_attributeCleanups[name].push(callback);
}
function cleanupAttributes(el, names) {
	if (!el._x_attributeCleanups) return;
	Object.entries(el._x_attributeCleanups).forEach(([name, value]) => {
		if (names === void 0 || names.includes(name)) {
			value.forEach((i) => i());
			delete el._x_attributeCleanups[name];
		}
	});
}
function cleanupElement(el) {
	el._x_effects?.forEach(dequeueJob);
	while (el._x_cleanups?.length) el._x_cleanups.pop()();
}
var observer = new MutationObserver(onMutate);
var currentlyObserving = false;
function startObservingMutations() {
	observer.observe(document, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeOldValue: true
	});
	currentlyObserving = true;
}
function stopObservingMutations() {
	flushObserver();
	observer.disconnect();
	currentlyObserving = false;
}
var queuedMutations = [];
function flushObserver() {
	let records = observer.takeRecords();
	queuedMutations.push(() => records.length > 0 && onMutate(records));
	let queueLengthWhenTriggered = queuedMutations.length;
	queueMicrotask(() => {
		if (queuedMutations.length === queueLengthWhenTriggered) while (queuedMutations.length > 0) queuedMutations.shift()();
	});
}
function mutateDom(callback) {
	if (!currentlyObserving) return callback();
	stopObservingMutations();
	let result = callback();
	startObservingMutations();
	return result;
}
var isCollecting = false;
var deferredMutations = [];
function deferMutations() {
	isCollecting = true;
}
function flushAndStopDeferringMutations() {
	isCollecting = false;
	onMutate(deferredMutations);
	deferredMutations = [];
}
function onMutate(mutations) {
	if (isCollecting) {
		deferredMutations = deferredMutations.concat(mutations);
		return;
	}
	let addedNodes = [];
	let removedNodes = /* @__PURE__ */ new Set();
	let addedAttributes = /* @__PURE__ */ new Map();
	let removedAttributes = /* @__PURE__ */ new Map();
	for (let i = 0; i < mutations.length; i++) {
		if (mutations[i].target._x_ignoreMutationObserver) continue;
		if (mutations[i].type === "childList") {
			mutations[i].removedNodes.forEach((node) => {
				if (node.nodeType !== 1) return;
				if (!node._x_marker) return;
				removedNodes.add(node);
			});
			mutations[i].addedNodes.forEach((node) => {
				if (node.nodeType !== 1) return;
				if (removedNodes.has(node)) {
					removedNodes.delete(node);
					return;
				}
				if (node._x_marker) return;
				addedNodes.push(node);
			});
		}
		if (mutations[i].type === "attributes") {
			let el = mutations[i].target;
			let name = mutations[i].attributeName;
			let oldValue = mutations[i].oldValue;
			let add = () => {
				if (!addedAttributes.has(el)) addedAttributes.set(el, []);
				addedAttributes.get(el).push({
					name,
					value: el.getAttribute(name)
				});
			};
			let remove2 = () => {
				if (!removedAttributes.has(el)) removedAttributes.set(el, []);
				removedAttributes.get(el).push(name);
			};
			if (el.hasAttribute(name) && oldValue === null) add();
			else if (el.hasAttribute(name)) {
				remove2();
				add();
			} else remove2();
		}
	}
	removedAttributes.forEach((attrs, el) => {
		cleanupAttributes(el, attrs);
	});
	addedAttributes.forEach((attrs, el) => {
		onAttributeAddeds.forEach((i) => i(el, attrs));
	});
	for (let node of removedNodes) {
		if (addedNodes.some((i) => i.contains(node))) continue;
		onElRemoveds.forEach((i) => i(node));
	}
	for (let node of addedNodes) {
		if (!node.isConnected) continue;
		onElAddeds.forEach((i) => i(node));
	}
	addedNodes = null;
	removedNodes = null;
	addedAttributes = null;
	removedAttributes = null;
}
function scope(node) {
	return mergeProxies(closestDataStack(node));
}
function addScopeToNode(node, data2, referenceNode) {
	node._x_dataStack = [data2, ...closestDataStack(referenceNode || node)];
	return () => {
		node._x_dataStack = node._x_dataStack.filter((i) => i !== data2);
	};
}
function closestDataStack(node) {
	if (node._x_dataStack) return node._x_dataStack;
	if (typeof ShadowRoot === "function" && node instanceof ShadowRoot) return closestDataStack(node.host);
	if (!node.parentNode) return [];
	return closestDataStack(node.parentNode);
}
function mergeProxies(objects) {
	return new Proxy({ objects }, mergeProxyTrap);
}
function keyInPrototypeChain(obj, key) {
	if (obj === null || obj === Object.prototype) return null;
	if (Object.prototype.hasOwnProperty.call(obj, key)) return obj;
	return keyInPrototypeChain(Object.getPrototypeOf(obj), key);
}
var mergeProxyTrap = {
	ownKeys({ objects }) {
		return Array.from(new Set(objects.flatMap((i) => Object.keys(i))));
	},
	has({ objects }, name) {
		if (name == Symbol.unscopables) return false;
		return objects.some((obj) => Object.prototype.hasOwnProperty.call(obj, name) || Reflect.has(obj, name));
	},
	get({ objects }, name, thisProxy) {
		if (name == "toJSON") return collapseProxies;
		return Reflect.get(objects.find((obj) => Reflect.has(obj, name)) || {}, name, thisProxy);
	},
	set({ objects }, name, value, thisProxy) {
		let target;
		for (const obj of objects) {
			target = keyInPrototypeChain(obj, name);
			if (target) break;
		}
		if (!target) target = objects[objects.length - 1];
		const descriptor = Object.getOwnPropertyDescriptor(target, name);
		if (descriptor?.set && descriptor?.get) return descriptor.set.call(thisProxy, value) || true;
		return Reflect.set(target, name, value);
	}
};
function collapseProxies() {
	return Reflect.ownKeys(this).reduce((acc, key) => {
		acc[key] = Reflect.get(this, key);
		return acc;
	}, {});
}
function initInterceptors(data2, cleanup = () => {}) {
	let isObject3 = (val) => typeof val === "object" && !Array.isArray(val) && val !== null;
	let recurse = (obj, basePath = "") => {
		Object.entries(Object.getOwnPropertyDescriptors(obj)).forEach(([key, { value, enumerable }]) => {
			if (enumerable === false || value === void 0) return;
			if (typeof value === "object" && value !== null && value.__v_skip) return;
			let path = basePath === "" ? key : `${basePath}.${key}`;
			if (typeof value === "object" && value !== null && value._x_interceptor) obj[key] = value.initialize(data2, path, key, cleanup);
			else if (isObject3(value) && value !== obj && !(value instanceof Element)) recurse(value, path);
		});
	};
	return recurse(data2);
}
function interceptor(callback, mutateObj = () => {}) {
	let obj = {
		initialValue: void 0,
		_x_interceptor: true,
		initialize(data2, path, key, cleanup) {
			return callback(this.initialValue, () => get(data2, path), (value) => set(data2, path, value), path, key, cleanup);
		}
	};
	mutateObj(obj);
	return (initialValue) => {
		if (typeof initialValue === "object" && initialValue !== null && initialValue._x_interceptor) {
			let initialize = obj.initialize.bind(obj);
			obj.initialize = (data2, path, key, cleanup) => {
				let innerValue = initialValue.initialize(data2, path, key, cleanup);
				obj.initialValue = innerValue;
				return initialize(data2, path, key, cleanup);
			};
		} else obj.initialValue = initialValue;
		return obj;
	};
}
function get(obj, path) {
	return path.split(".").reduce((carry, segment) => carry[segment], obj);
}
function set(obj, path, value) {
	if (typeof path === "string") path = path.split(".");
	if (path.length === 1) obj[path[0]] = value;
	else if (path.length === 0) throw error;
	else if (obj[path[0]]) return set(obj[path[0]], path.slice(1), value);
	else {
		obj[path[0]] = {};
		return set(obj[path[0]], path.slice(1), value);
	}
}
var magics = {};
function magic(name, callback) {
	magics[name] = callback;
}
function injectMagics(obj, el) {
	let memoizedUtilities = getUtilities(el);
	Object.entries(magics).forEach(([name, callback]) => {
		Object.defineProperty(obj, `$${name}`, {
			get() {
				return callback(el, memoizedUtilities);
			},
			enumerable: false
		});
	});
	return obj;
}
function getUtilities(el) {
	let [utilities, cleanup] = getElementBoundUtilities(el);
	let utils = {
		interceptor,
		...utilities
	};
	onElRemoved(el, cleanup);
	return utils;
}
function tryCatch(el, expression, callback, ...args) {
	try {
		return callback(...args);
	} catch (e) {
		handleError(e, el, expression);
	}
}
function handleError(...args) {
	return errorHandler(...args);
}
var errorHandler = normalErrorHandler;
function setErrorHandler(handler4) {
	errorHandler = handler4;
}
function normalErrorHandler(error2, el, expression = void 0) {
	error2 = Object.assign(error2 ?? { message: "No error message given." }, {
		el,
		expression
	});
	console.warn(`Alpine Expression Error: ${error2.message}

${expression ? "Expression: \"" + expression + "\"\n\n" : ""}`, el);
	setTimeout(() => {
		throw error2;
	}, 0);
}
var shouldAutoEvaluateFunctions = true;
function dontAutoEvaluateFunctions(callback) {
	let cache = shouldAutoEvaluateFunctions;
	shouldAutoEvaluateFunctions = false;
	let result = callback();
	shouldAutoEvaluateFunctions = cache;
	return result;
}
function evaluate(el, expression, extras = {}) {
	let result;
	evaluateLater(el, expression)((value) => result = value, extras);
	return result;
}
function evaluateLater(...args) {
	return theEvaluatorFunction(...args);
}
var theEvaluatorFunction = () => {};
function setEvaluator(newEvaluator) {
	theEvaluatorFunction = newEvaluator;
}
var theRawEvaluatorFunction;
function setRawEvaluator(newEvaluator) {
	theRawEvaluatorFunction = newEvaluator;
}
function normalEvaluator(el, expression) {
	let overriddenMagics = {};
	injectMagics(overriddenMagics, el);
	let dataStack = [overriddenMagics, ...closestDataStack(el)];
	let evaluator = typeof expression === "function" ? generateEvaluatorFromFunction(dataStack, expression) : generateEvaluatorFromString(dataStack, expression, el);
	return tryCatch.bind(null, el, expression, evaluator);
}
function generateEvaluatorFromFunction(dataStack, func) {
	return (receiver = () => {}, { scope: scope2 = {}, params = [], context } = {}) => {
		if (!shouldAutoEvaluateFunctions) {
			runIfTypeOfFunction(receiver, func, mergeProxies([scope2, ...dataStack]), params);
			return;
		}
		runIfTypeOfFunction(receiver, func.apply(mergeProxies([scope2, ...dataStack]), params));
	};
}
var evaluatorMemo = {};
function generateFunctionFromString(expression, el) {
	if (evaluatorMemo[expression]) return evaluatorMemo[expression];
	let AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
	let rightSideSafeExpression = /^[\n\s]*if.*\(.*\)/.test(expression.trim()) || /^(let|const)\s/.test(expression.trim()) ? `(async()=>{ ${expression} })()` : expression;
	const safeAsyncFunction = () => {
		try {
			let func2 = new AsyncFunction(["__self", "scope"], `with (scope) { __self.result = ${rightSideSafeExpression} }; __self.finished = true; return __self.result;`);
			Object.defineProperty(func2, "name", { value: `[Alpine] ${expression}` });
			return func2;
		} catch (error2) {
			handleError(error2, el, expression);
			return Promise.resolve();
		}
	};
	let func = safeAsyncFunction();
	evaluatorMemo[expression] = func;
	return func;
}
function generateEvaluatorFromString(dataStack, expression, el) {
	let func = generateFunctionFromString(expression, el);
	return (receiver = () => {}, { scope: scope2 = {}, params = [], context } = {}) => {
		func.result = void 0;
		func.finished = false;
		let completeScope = mergeProxies([scope2, ...dataStack]);
		if (typeof func === "function") {
			let promise = func.call(context, func, completeScope).catch((error2) => handleError(error2, el, expression));
			if (func.finished) {
				runIfTypeOfFunction(receiver, func.result, completeScope, params, el);
				func.result = void 0;
			} else promise.then((result) => {
				runIfTypeOfFunction(receiver, result, completeScope, params, el);
			}).catch((error2) => handleError(error2, el, expression)).finally(() => func.result = void 0);
		}
	};
}
function runIfTypeOfFunction(receiver, value, scope2, params, el) {
	if (shouldAutoEvaluateFunctions && typeof value === "function") {
		let result = value.apply(scope2, params);
		if (result instanceof Promise) result.then((i) => runIfTypeOfFunction(receiver, i, scope2, params)).catch((error2) => handleError(error2, el, value));
		else receiver(result);
	} else if (typeof value === "object" && value instanceof Promise) value.then((i) => receiver(i));
	else receiver(value);
}
function evaluateRaw(...args) {
	return theRawEvaluatorFunction(...args);
}
function normalRawEvaluator(el, expression, extras = {}) {
	let overriddenMagics = {};
	injectMagics(overriddenMagics, el);
	let dataStack = [overriddenMagics, ...closestDataStack(el)];
	let scope2 = mergeProxies([extras.scope ?? {}, ...dataStack]);
	let params = extras.params ?? [];
	if (expression.includes("await")) {
		let AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
		return new AsyncFunction(["scope"], `with (scope) { let __result = ${/^[\n\s]*if.*\(.*\)/.test(expression.trim()) || /^(let|const)\s/.test(expression.trim()) ? `(async()=>{ ${expression} })()` : expression}; return __result }`).call(extras.context, scope2);
	} else {
		let rightSideSafeExpression = /^[\n\s]*if.*\(.*\)/.test(expression.trim()) || /^(let|const)\s/.test(expression.trim()) ? `(()=>{ ${expression} })()` : expression;
		let result = new Function(["scope"], `with (scope) { let __result = ${rightSideSafeExpression}; return __result }`).call(extras.context, scope2);
		if (typeof result === "function" && shouldAutoEvaluateFunctions) return result.apply(scope2, params);
		return result;
	}
}
var prefixAsString = "x-";
function prefix(subject = "") {
	return prefixAsString + subject;
}
function setPrefix(newPrefix) {
	prefixAsString = newPrefix;
}
var directiveHandlers = {};
function directive(name, callback) {
	directiveHandlers[name] = callback;
	return { before(directive2) {
		if (!directiveHandlers[directive2]) {
			console.warn(String.raw`Cannot find directive \`${directive2}\`. \`${name}\` will use the default order of execution`);
			return;
		}
		const pos = directiveOrder.indexOf(directive2);
		directiveOrder.splice(pos >= 0 ? pos : directiveOrder.indexOf("DEFAULT"), 0, name);
	} };
}
function directiveExists(name) {
	return Object.keys(directiveHandlers).includes(name);
}
function directives(el, attributes, originalAttributeOverride) {
	attributes = Array.from(attributes);
	if (el._x_virtualDirectives) {
		let vAttributes = Object.entries(el._x_virtualDirectives).map(([name, value]) => ({
			name,
			value
		}));
		let staticAttributes = attributesOnly(vAttributes);
		vAttributes = vAttributes.map((attribute) => {
			if (staticAttributes.find((attr) => attr.name === attribute.name)) return {
				name: `x-bind:${attribute.name}`,
				value: `"${attribute.value}"`
			};
			return attribute;
		});
		attributes = attributes.concat(vAttributes);
	}
	let transformedAttributeMap = {};
	return attributes.map(toTransformedAttributes((newName, oldName) => transformedAttributeMap[newName] = oldName)).filter(outNonAlpineAttributes).map(toParsedDirectives(transformedAttributeMap, originalAttributeOverride)).sort(byPriority).map((directive2) => {
		return getDirectiveHandler(el, directive2);
	});
}
function attributesOnly(attributes) {
	return Array.from(attributes).map(toTransformedAttributes()).filter((attr) => !outNonAlpineAttributes(attr));
}
var isDeferringHandlers = false;
var directiveHandlerStacks = /* @__PURE__ */ new Map();
var currentHandlerStackKey = Symbol();
function deferHandlingDirectives(callback) {
	isDeferringHandlers = true;
	let key = Symbol();
	currentHandlerStackKey = key;
	directiveHandlerStacks.set(key, []);
	let flushHandlers = () => {
		while (directiveHandlerStacks.get(key).length) directiveHandlerStacks.get(key).shift()();
		directiveHandlerStacks.delete(key);
	};
	let stopDeferring = () => {
		isDeferringHandlers = false;
		flushHandlers();
	};
	callback(flushHandlers);
	stopDeferring();
}
function getElementBoundUtilities(el) {
	let cleanups = [];
	let cleanup = (callback) => cleanups.push(callback);
	let [effect3, cleanupEffect2] = elementBoundEffect(el);
	cleanups.push(cleanupEffect2);
	let utilities = {
		Alpine: alpine_default,
		effect: effect3,
		cleanup,
		evaluateLater: evaluateLater.bind(evaluateLater, el),
		evaluate: evaluate.bind(evaluate, el)
	};
	let doCleanup = () => cleanups.forEach((i) => i());
	return [utilities, doCleanup];
}
function getDirectiveHandler(el, directive2) {
	let noop = () => {};
	let handler4 = directiveHandlers[directive2.type] || noop;
	let [utilities, cleanup] = getElementBoundUtilities(el);
	onAttributeRemoved(el, directive2.original, cleanup);
	let fullHandler = () => {
		if (el._x_ignore || el._x_ignoreSelf) return;
		handler4.inline && handler4.inline(el, directive2, utilities);
		handler4 = handler4.bind(handler4, el, directive2, utilities);
		isDeferringHandlers ? directiveHandlerStacks.get(currentHandlerStackKey).push(handler4) : handler4();
	};
	fullHandler.runCleanups = cleanup;
	return fullHandler;
}
var startingWith = (subject, replacement) => ({ name, value }) => {
	if (name.startsWith(subject)) name = name.replace(subject, replacement);
	return {
		name,
		value
	};
};
var into = (i) => i;
function toTransformedAttributes(callback = () => {}) {
	return ({ name, value }) => {
		let { name: newName, value: newValue } = attributeTransformers.reduce((carry, transform) => {
			return transform(carry);
		}, {
			name,
			value
		});
		if (newName !== name) callback(newName, name);
		return {
			name: newName,
			value: newValue
		};
	};
}
var attributeTransformers = [];
function mapAttributes(callback) {
	attributeTransformers.push(callback);
}
function outNonAlpineAttributes({ name }) {
	return alpineAttributeRegex().test(name);
}
var alpineAttributeRegex = () => new RegExp(`^${prefixAsString}([^:^.]+)\\b`);
function toParsedDirectives(transformedAttributeMap, originalAttributeOverride) {
	return ({ name, value }) => {
		if (name === value) value = "";
		let typeMatch = name.match(alpineAttributeRegex());
		let valueMatch = name.match(/:([a-zA-Z0-9\-_:]+)/);
		let modifiers = name.match(/\.[^.\]]+(?=[^\]]*$)/g) || [];
		let original = originalAttributeOverride || transformedAttributeMap[name] || name;
		return {
			type: typeMatch ? typeMatch[1] : null,
			value: valueMatch ? valueMatch[1] : null,
			modifiers: modifiers.map((i) => i.replace(".", "")),
			expression: value,
			original
		};
	};
}
var DEFAULT = "DEFAULT";
var directiveOrder = [
	"ignore",
	"ref",
	"id",
	"data",
	"anchor",
	"bind",
	"init",
	"for",
	"model",
	"modelable",
	"transition",
	"show",
	"if",
	DEFAULT,
	"teleport"
];
function byPriority(a, b) {
	let typeA = directiveOrder.indexOf(a.type) === -1 ? DEFAULT : a.type;
	let typeB = directiveOrder.indexOf(b.type) === -1 ? DEFAULT : b.type;
	return directiveOrder.indexOf(typeA) - directiveOrder.indexOf(typeB);
}
function dispatch(el, name, detail = {}, options = {}) {
	return el.dispatchEvent(new CustomEvent(name, {
		detail,
		bubbles: true,
		composed: true,
		cancelable: true,
		...options
	}));
}
function walk(el, callback) {
	if (typeof ShadowRoot === "function" && el instanceof ShadowRoot) {
		Array.from(el.children).forEach((el2) => walk(el2, callback));
		return;
	}
	let skip = false;
	callback(el, () => skip = true);
	if (skip) return;
	let node = el.firstElementChild;
	while (node) {
		walk(node, callback, false);
		node = node.nextElementSibling;
	}
}
function warn(message, ...args) {
	console.warn(`Alpine Warning: ${message}`, ...args);
}
var started = false;
function start() {
	if (started) warn("Alpine has already been initialized on this page. Calling Alpine.start() more than once can cause problems.");
	started = true;
	if (!document.body) warn("Unable to initialize. Trying to load Alpine before `<body>` is available. Did you forget to add `defer` in Alpine's `<script>` tag?");
	dispatch(document, "alpine:init");
	dispatch(document, "alpine:initializing");
	startObservingMutations();
	onElAdded((el) => initTree(el, walk));
	onElRemoved((el) => destroyTree(el));
	onAttributesAdded((el, attrs) => {
		directives(el, attrs).forEach((handle) => handle());
	});
	let outNestedComponents = (el) => !closestRoot(el.parentElement, true);
	Array.from(document.querySelectorAll(allSelectors().join(","))).filter(outNestedComponents).forEach((el) => {
		initTree(el);
	});
	dispatch(document, "alpine:initialized");
	setTimeout(() => {
		warnAboutMissingPlugins();
	});
}
var rootSelectorCallbacks = [];
var initSelectorCallbacks = [];
function rootSelectors() {
	return rootSelectorCallbacks.map((fn) => fn());
}
function allSelectors() {
	return rootSelectorCallbacks.concat(initSelectorCallbacks).map((fn) => fn());
}
function addRootSelector(selectorCallback) {
	rootSelectorCallbacks.push(selectorCallback);
}
function addInitSelector(selectorCallback) {
	initSelectorCallbacks.push(selectorCallback);
}
function closestRoot(el, includeInitSelectors = false) {
	return findClosest(el, (element) => {
		if ((includeInitSelectors ? allSelectors() : rootSelectors()).some((selector) => element.matches(selector))) return true;
	});
}
function findClosest(el, callback) {
	if (!el) return;
	if (callback(el)) return el;
	if (el._x_teleportBack) return findClosest(el._x_teleportBack, callback);
	if (el.parentNode instanceof ShadowRoot) return findClosest(el.parentNode.host, callback);
	if (!el.parentElement) return;
	return findClosest(el.parentElement, callback);
}
function isRoot(el) {
	return rootSelectors().some((selector) => el.matches(selector));
}
var initInterceptors2 = [];
function interceptInit(callback) {
	initInterceptors2.push(callback);
}
var markerDispenser = 1;
function initTree(el, walker = walk, intercept = () => {}) {
	if (findClosest(el, (i) => i._x_ignore)) return;
	deferHandlingDirectives(() => {
		walker(el, (el2, skip) => {
			if (el2._x_marker) return;
			intercept(el2, skip);
			initInterceptors2.forEach((i) => i(el2, skip));
			directives(el2, el2.attributes).forEach((handle) => handle());
			if (!el2._x_ignore) el2._x_marker = markerDispenser++;
			el2._x_ignore && skip();
		});
	});
}
function destroyTree(root, walker = walk) {
	walker(root, (el) => {
		cleanupElement(el);
		cleanupAttributes(el);
		delete el._x_marker;
	});
}
function warnAboutMissingPlugins() {
	[
		[
			"ui",
			"dialog",
			["[x-dialog], [x-popover]"]
		],
		[
			"anchor",
			"anchor",
			["[x-anchor]"]
		],
		[
			"sort",
			"sort",
			["[x-sort]"]
		]
	].forEach(([plugin2, directive2, selectors]) => {
		if (directiveExists(directive2)) return;
		selectors.some((selector) => {
			if (document.querySelector(selector)) {
				warn(`found "${selector}", but missing ${plugin2} plugin`);
				return true;
			}
		});
	});
}
var tickStack = [];
var isHolding = false;
function nextTick(callback = () => {}) {
	queueMicrotask(() => {
		isHolding || setTimeout(() => {
			releaseNextTicks();
		});
	});
	return new Promise((res) => {
		tickStack.push(() => {
			callback();
			res();
		});
	});
}
function releaseNextTicks() {
	isHolding = false;
	while (tickStack.length) tickStack.shift()();
}
function holdNextTicks() {
	isHolding = true;
}
function setClasses(el, value) {
	if (Array.isArray(value)) return setClassesFromString(el, value.join(" "));
	else if (typeof value === "object" && value !== null) return setClassesFromObject(el, value);
	else if (typeof value === "function") return setClasses(el, value());
	return setClassesFromString(el, value);
}
function splitClasses(classString) {
	return classString.split(/\s/).filter(Boolean);
}
function setClassesFromString(el, classString) {
	let missingClasses = (classString2) => splitClasses(classString2).filter((i) => !el.classList.contains(i)).filter(Boolean);
	let addClassesAndReturnUndo = (classes) => {
		el.classList.add(...classes);
		return () => {
			el.classList.remove(...classes);
		};
	};
	classString = classString === true ? classString = "" : classString || "";
	return addClassesAndReturnUndo(missingClasses(classString));
}
function setClassesFromObject(el, classObject) {
	let forAdd = Object.entries(classObject).flatMap(([classString, bool]) => bool ? splitClasses(classString) : false).filter(Boolean);
	let forRemove = Object.entries(classObject).flatMap(([classString, bool]) => !bool ? splitClasses(classString) : false).filter(Boolean);
	let added = [];
	let removed = [];
	forRemove.forEach((i) => {
		if (el.classList.contains(i)) {
			el.classList.remove(i);
			removed.push(i);
		}
	});
	forAdd.forEach((i) => {
		if (!el.classList.contains(i)) {
			el.classList.add(i);
			added.push(i);
		}
	});
	return () => {
		removed.forEach((i) => el.classList.add(i));
		added.forEach((i) => el.classList.remove(i));
	};
}
function setStyles(el, value) {
	if (typeof value === "object" && value !== null) return setStylesFromObject(el, value);
	return setStylesFromString(el, value);
}
function setStylesFromObject(el, value) {
	let previousStyles = {};
	Object.entries(value).forEach(([key, value2]) => {
		previousStyles[key] = el.style[key];
		if (!key.startsWith("--")) key = kebabCase(key);
		el.style.setProperty(key, value2);
	});
	setTimeout(() => {
		if (el.style.length === 0) el.removeAttribute("style");
	});
	return () => {
		setStyles(el, previousStyles);
	};
}
function setStylesFromString(el, value) {
	let cache = el.getAttribute("style", value);
	el.setAttribute("style", value);
	return () => {
		el.setAttribute("style", cache || "");
	};
}
function kebabCase(subject) {
	return subject.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
function once(callback, fallback = () => {}) {
	let called = false;
	return function() {
		if (!called) {
			called = true;
			callback.apply(this, arguments);
		} else fallback.apply(this, arguments);
	};
}
directive("transition", (el, { value, modifiers, expression }, { evaluate: evaluate2 }) => {
	if (typeof expression === "function") expression = evaluate2(expression);
	if (expression === false) return;
	if (!expression || typeof expression === "boolean") registerTransitionsFromHelper(el, modifiers, value);
	else registerTransitionsFromClassString(el, expression, value);
});
function registerTransitionsFromClassString(el, classString, stage) {
	registerTransitionObject(el, setClasses, "");
	({
		"enter": (classes) => {
			el._x_transition.enter.during = classes;
		},
		"enter-start": (classes) => {
			el._x_transition.enter.start = classes;
		},
		"enter-end": (classes) => {
			el._x_transition.enter.end = classes;
		},
		"leave": (classes) => {
			el._x_transition.leave.during = classes;
		},
		"leave-start": (classes) => {
			el._x_transition.leave.start = classes;
		},
		"leave-end": (classes) => {
			el._x_transition.leave.end = classes;
		}
	})[stage](classString);
}
function registerTransitionsFromHelper(el, modifiers, stage) {
	registerTransitionObject(el, setStyles);
	let doesntSpecify = !modifiers.includes("in") && !modifiers.includes("out") && !stage;
	let transitioningIn = doesntSpecify || modifiers.includes("in") || ["enter"].includes(stage);
	let transitioningOut = doesntSpecify || modifiers.includes("out") || ["leave"].includes(stage);
	if (modifiers.includes("in") && !doesntSpecify) modifiers = modifiers.filter((i, index) => index < modifiers.indexOf("out"));
	if (modifiers.includes("out") && !doesntSpecify) modifiers = modifiers.filter((i, index) => index > modifiers.indexOf("out"));
	let wantsAll = !modifiers.includes("opacity") && !modifiers.includes("scale");
	let wantsOpacity = wantsAll || modifiers.includes("opacity");
	let wantsScale = wantsAll || modifiers.includes("scale");
	let opacityValue = wantsOpacity ? 0 : 1;
	let scaleValue = wantsScale ? modifierValue(modifiers, "scale", 95) / 100 : 1;
	let delay = modifierValue(modifiers, "delay", 0) / 1e3;
	let origin = modifierValue(modifiers, "origin", "center");
	let property = "opacity, transform";
	let durationIn = modifierValue(modifiers, "duration", 150) / 1e3;
	let durationOut = modifierValue(modifiers, "duration", 75) / 1e3;
	let easing = `cubic-bezier(0.4, 0.0, 0.2, 1)`;
	if (transitioningIn) {
		el._x_transition.enter.during = {
			transformOrigin: origin,
			transitionDelay: `${delay}s`,
			transitionProperty: property,
			transitionDuration: `${durationIn}s`,
			transitionTimingFunction: easing
		};
		el._x_transition.enter.start = {
			opacity: opacityValue,
			transform: `scale(${scaleValue})`
		};
		el._x_transition.enter.end = {
			opacity: 1,
			transform: `scale(1)`
		};
	}
	if (transitioningOut) {
		el._x_transition.leave.during = {
			transformOrigin: origin,
			transitionDelay: `${delay}s`,
			transitionProperty: property,
			transitionDuration: `${durationOut}s`,
			transitionTimingFunction: easing
		};
		el._x_transition.leave.start = {
			opacity: 1,
			transform: `scale(1)`
		};
		el._x_transition.leave.end = {
			opacity: opacityValue,
			transform: `scale(${scaleValue})`
		};
	}
}
function registerTransitionObject(el, setFunction, defaultValue = {}) {
	if (!el._x_transition) el._x_transition = {
		enter: {
			during: defaultValue,
			start: defaultValue,
			end: defaultValue
		},
		leave: {
			during: defaultValue,
			start: defaultValue,
			end: defaultValue
		},
		in(before = () => {}, after = () => {}) {
			transition(el, setFunction, {
				during: this.enter.during,
				start: this.enter.start,
				end: this.enter.end
			}, before, after);
		},
		out(before = () => {}, after = () => {}) {
			transition(el, setFunction, {
				during: this.leave.during,
				start: this.leave.start,
				end: this.leave.end
			}, before, after);
		}
	};
}
window.Element.prototype._x_toggleAndCascadeWithTransitions = function(el, value, show, hide) {
	const nextTick2 = document.visibilityState === "visible" ? requestAnimationFrame : setTimeout;
	let clickAwayCompatibleShow = () => nextTick2(show);
	if (value) {
		if (el._x_transition && (el._x_transition.enter || el._x_transition.leave)) el._x_transition.enter && (Object.entries(el._x_transition.enter.during).length || Object.entries(el._x_transition.enter.start).length || Object.entries(el._x_transition.enter.end).length) ? el._x_transition.in(show) : clickAwayCompatibleShow();
		else el._x_transition ? el._x_transition.in(show) : clickAwayCompatibleShow();
		return;
	}
	el._x_hidePromise = el._x_transition ? new Promise((resolve, reject) => {
		el._x_transition.out(() => {}, () => resolve(hide));
		el._x_transitioning && el._x_transitioning.beforeCancel(() => reject({ isFromCancelledTransition: true }));
	}) : Promise.resolve(hide);
	queueMicrotask(() => {
		let closest = closestHide(el);
		if (closest) {
			if (!closest._x_hideChildren) closest._x_hideChildren = [];
			closest._x_hideChildren.push(el);
		} else nextTick2(() => {
			let hideAfterChildren = (el2) => {
				let carry = Promise.all([el2._x_hidePromise, ...(el2._x_hideChildren || []).map(hideAfterChildren)]).then(([i]) => i?.());
				delete el2._x_hidePromise;
				delete el2._x_hideChildren;
				return carry;
			};
			hideAfterChildren(el).catch((e) => {
				if (!e.isFromCancelledTransition) throw e;
			});
		});
	});
};
function closestHide(el) {
	let parent = el.parentNode;
	if (!parent) return;
	return parent._x_hidePromise ? parent : closestHide(parent);
}
function transition(el, setFunction, { during, start: start2, end } = {}, before = () => {}, after = () => {}) {
	if (el._x_transitioning) el._x_transitioning.cancel();
	if (Object.keys(during).length === 0 && Object.keys(start2).length === 0 && Object.keys(end).length === 0) {
		before();
		after();
		return;
	}
	let undoStart, undoDuring, undoEnd;
	performTransition(el, {
		start() {
			undoStart = setFunction(el, start2);
		},
		during() {
			undoDuring = setFunction(el, during);
		},
		before,
		end() {
			undoStart();
			undoEnd = setFunction(el, end);
		},
		after,
		cleanup() {
			undoDuring();
			undoEnd();
		}
	});
}
function performTransition(el, stages) {
	let interrupted, reachedBefore, reachedEnd;
	let finish = once(() => {
		mutateDom(() => {
			interrupted = true;
			if (!reachedBefore) stages.before();
			if (!reachedEnd) {
				stages.end();
				releaseNextTicks();
			}
			stages.after();
			if (el.isConnected) stages.cleanup();
			delete el._x_transitioning;
		});
	});
	el._x_transitioning = {
		beforeCancels: [],
		beforeCancel(callback) {
			this.beforeCancels.push(callback);
		},
		cancel: once(function() {
			while (this.beforeCancels.length) this.beforeCancels.shift()();
			finish();
		}),
		finish
	};
	mutateDom(() => {
		stages.start();
		stages.during();
	});
	holdNextTicks();
	requestAnimationFrame(() => {
		if (interrupted) return;
		let duration = Number(getComputedStyle(el).transitionDuration.replace(/,.*/, "").replace("s", "")) * 1e3;
		let delay = Number(getComputedStyle(el).transitionDelay.replace(/,.*/, "").replace("s", "")) * 1e3;
		if (duration === 0) duration = Number(getComputedStyle(el).animationDuration.replace("s", "")) * 1e3;
		mutateDom(() => {
			stages.before();
		});
		reachedBefore = true;
		requestAnimationFrame(() => {
			if (interrupted) return;
			mutateDom(() => {
				stages.end();
			});
			releaseNextTicks();
			setTimeout(el._x_transitioning.finish, duration + delay);
			reachedEnd = true;
		});
	});
}
function modifierValue(modifiers, key, fallback) {
	if (modifiers.indexOf(key) === -1) return fallback;
	const rawValue = modifiers[modifiers.indexOf(key) + 1];
	if (!rawValue) return fallback;
	if (key === "scale") {
		if (isNaN(rawValue)) return fallback;
	}
	if (key === "duration" || key === "delay") {
		let match = rawValue.match(/([0-9]+)ms/);
		if (match) return match[1];
	}
	if (key === "origin") {
		if ([
			"top",
			"right",
			"left",
			"center",
			"bottom"
		].includes(modifiers[modifiers.indexOf(key) + 2])) return [rawValue, modifiers[modifiers.indexOf(key) + 2]].join(" ");
	}
	return rawValue;
}
var isCloning = false;
function skipDuringClone(callback, fallback = () => {}) {
	return (...args) => isCloning ? fallback(...args) : callback(...args);
}
function onlyDuringClone(callback) {
	return (...args) => isCloning && callback(...args);
}
var interceptors = [];
function interceptClone(callback) {
	interceptors.push(callback);
}
function cloneNode(from, to) {
	interceptors.forEach((i) => i(from, to));
	isCloning = true;
	dontRegisterReactiveSideEffects(() => {
		initTree(to, (el, callback) => {
			callback(el, () => {});
		});
	});
	isCloning = false;
}
var isCloningLegacy = false;
function clone(oldEl, newEl) {
	if (!newEl._x_dataStack) newEl._x_dataStack = oldEl._x_dataStack;
	isCloning = true;
	isCloningLegacy = true;
	dontRegisterReactiveSideEffects(() => {
		cloneTree(newEl);
	});
	isCloning = false;
	isCloningLegacy = false;
}
function cloneTree(el) {
	let hasRunThroughFirstEl = false;
	let shallowWalker = (el2, callback) => {
		walk(el2, (el3, skip) => {
			if (hasRunThroughFirstEl && isRoot(el3)) return skip();
			hasRunThroughFirstEl = true;
			callback(el3, skip);
		});
	};
	initTree(el, shallowWalker);
}
function dontRegisterReactiveSideEffects(callback) {
	let cache = effect;
	overrideEffect((callback2, el) => {
		let storedEffect = cache(callback2);
		release(storedEffect);
		return () => {};
	});
	callback();
	overrideEffect(cache);
}
function bind(el, name, value, modifiers = []) {
	if (!el._x_bindings) el._x_bindings = reactive({});
	el._x_bindings[name] = value;
	name = modifiers.includes("camel") ? camelCase(name) : name;
	switch (name) {
		case "value":
			bindInputValue(el, value);
			break;
		case "style":
			bindStyles(el, value);
			break;
		case "class":
			bindClasses(el, value);
			break;
		case "selected":
		case "checked":
			bindAttributeAndProperty(el, name, value);
			break;
		default: bindAttribute(el, name, value);
	}
}
function bindInputValue(el, value) {
	if (isRadio(el)) {
		if (el.attributes.value === void 0) el.value = value;
	} else if (isCheckbox(el)) {
		if (Number.isInteger(value)) el.value = value;
		else if (!Array.isArray(value) && typeof value !== "boolean" && ![null, void 0].includes(value)) el.value = String(value);
		else if (Array.isArray(value)) el.checked = value.some((val) => checkedAttrLooseCompare(val, el.value));
		else el.checked = !!value;
	} else if (el.tagName === "SELECT") updateSelect(el, value);
	else if (el.tagName === "OPTION") bindAttribute(el, "value", value);
	else {
		if (el.value === value && (typeof value !== "object" || value === null)) return;
		el.value = value === void 0 ? "" : value;
	}
}
function bindClasses(el, value) {
	if (el._x_undoAddedClasses) el._x_undoAddedClasses();
	el._x_undoAddedClasses = setClasses(el, value);
}
function bindStyles(el, value) {
	if (el._x_undoAddedStyles) el._x_undoAddedStyles();
	el._x_undoAddedStyles = setStyles(el, value);
}
function bindAttributeAndProperty(el, name, value) {
	bindAttribute(el, name, value);
	setPropertyIfChanged(el, name, value);
}
function bindAttribute(el, name, value) {
	if ([
		null,
		void 0,
		false
	].includes(value) && attributeShouldntBePreservedIfFalsy(name)) el.removeAttribute(name);
	else {
		if (isBooleanAttr(name)) value = name;
		if (isObjectAttr(value)) value = JSON.stringify(value);
		setIfChanged(el, name, value);
	}
}
function setIfChanged(el, attrName, value) {
	if (el.getAttribute(attrName) != value) el.setAttribute(attrName, value);
}
function setPropertyIfChanged(el, propName, value) {
	if (el[propName] !== value) el[propName] = value;
}
function updateSelect(el, value) {
	const arrayWrappedValue = [].concat(value).map((value2) => {
		return value2 + "";
	});
	Array.from(el.options).forEach((option) => {
		option.selected = arrayWrappedValue.includes(option.value);
	});
}
function camelCase(subject) {
	return subject.toLowerCase().replace(/-(\w)/g, (match, char) => char.toUpperCase());
}
function checkedAttrLooseCompare(valueA, valueB) {
	return valueA == valueB;
}
function safeParseBoolean(rawValue) {
	if ([
		1,
		"1",
		"true",
		"on",
		"yes",
		true
	].includes(rawValue)) return true;
	if ([
		0,
		"0",
		"false",
		"off",
		"no",
		false
	].includes(rawValue)) return false;
	return rawValue ? Boolean(rawValue) : null;
}
var booleanAttributes = /* @__PURE__ */ new Set([
	"allowfullscreen",
	"async",
	"autofocus",
	"autoplay",
	"checked",
	"controls",
	"default",
	"defer",
	"disabled",
	"formnovalidate",
	"inert",
	"ismap",
	"itemscope",
	"loop",
	"multiple",
	"muted",
	"nomodule",
	"novalidate",
	"open",
	"playsinline",
	"readonly",
	"required",
	"reversed",
	"selected",
	"shadowrootclonable",
	"shadowrootdelegatesfocus",
	"shadowrootserializable"
]);
function isBooleanAttr(attrName) {
	return booleanAttributes.has(attrName);
}
function attributeShouldntBePreservedIfFalsy(name) {
	return ![
		"aria-pressed",
		"aria-checked",
		"aria-expanded",
		"aria-selected"
	].includes(name);
}
function isObjectAttr(value) {
	return typeof value === "object" && value !== null;
}
function getBinding(el, name, fallback) {
	if (el._x_bindings && el._x_bindings[name] !== void 0) return el._x_bindings[name];
	return getAttributeBinding(el, name, fallback);
}
function extractProp(el, name, fallback, extract = true) {
	if (el._x_bindings && el._x_bindings[name] !== void 0) return el._x_bindings[name];
	if (el._x_inlineBindings && el._x_inlineBindings[name] !== void 0) {
		let binding = el._x_inlineBindings[name];
		binding.extract = extract;
		return dontAutoEvaluateFunctions(() => {
			return evaluate(el, binding.expression);
		});
	}
	return getAttributeBinding(el, name, fallback);
}
function getAttributeBinding(el, name, fallback) {
	let attr = el.getAttribute(name);
	if (attr === null) return typeof fallback === "function" ? fallback() : fallback;
	if (attr === "") return true;
	if (isBooleanAttr(name)) return !![name, "true"].includes(attr);
	return attr;
}
function isCheckbox(el) {
	return el.type === "checkbox" || el.localName === "ui-checkbox" || el.localName === "ui-switch";
}
function isRadio(el) {
	return el.type === "radio" || el.localName === "ui-radio";
}
function debounce(func, wait) {
	let timeout;
	return function() {
		const context = this, args = arguments;
		const later = function() {
			timeout = null;
			func.apply(context, args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}
function throttle(func, limit) {
	let inThrottle;
	return function() {
		let context = this, args = arguments;
		if (!inThrottle) {
			func.apply(context, args);
			inThrottle = true;
			setTimeout(() => inThrottle = false, limit);
		}
	};
}
function entangle({ get: outerGet, set: outerSet }, { get: innerGet, set: innerSet }) {
	let firstRun = true;
	let outerHash;
	let reference = effect(() => {
		let outer = outerGet();
		let inner = innerGet();
		if (firstRun) {
			innerSet(cloneIfObject(outer));
			firstRun = false;
		} else {
			let outerHashLatest = JSON.stringify(outer);
			let innerHashLatest = JSON.stringify(inner);
			if (outerHashLatest !== outerHash) innerSet(cloneIfObject(outer));
			else if (outerHashLatest !== innerHashLatest) outerSet(cloneIfObject(inner));
		}
		outerHash = JSON.stringify(outerGet());
		JSON.stringify(innerGet());
	});
	return () => {
		release(reference);
	};
}
function cloneIfObject(value) {
	return typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}
function plugin(callback) {
	(Array.isArray(callback) ? callback : [callback]).forEach((i) => i(alpine_default));
}
var stores = {};
var isReactive = false;
function store(name, value) {
	if (!isReactive) {
		stores = reactive(stores);
		isReactive = true;
	}
	if (value === void 0) return stores[name];
	stores[name] = value;
	if (typeof value === "object" && value !== null && value._x_interceptor) stores[name] = value.initialize(stores, name, name, () => {});
	else initInterceptors(stores[name]);
	if (typeof value === "object" && value !== null && value.hasOwnProperty("init") && typeof value.init === "function") stores[name].init();
}
function getStores() {
	return stores;
}
var binds = {};
function bind2(name, bindings) {
	let getBindings = typeof bindings !== "function" ? () => bindings : bindings;
	if (name instanceof Element) return applyBindingsObject(name, getBindings());
	else binds[name] = getBindings;
	return () => {};
}
function injectBindingProviders(obj) {
	Object.entries(binds).forEach(([name, callback]) => {
		Object.defineProperty(obj, name, { get() {
			return (...args) => {
				return callback(...args);
			};
		} });
	});
	return obj;
}
function applyBindingsObject(el, obj, original) {
	let cleanupRunners = [];
	while (cleanupRunners.length) cleanupRunners.pop()();
	let attributes = Object.entries(obj).map(([name, value]) => ({
		name,
		value
	}));
	let staticAttributes = attributesOnly(attributes);
	attributes = attributes.map((attribute) => {
		if (staticAttributes.find((attr) => attr.name === attribute.name)) return {
			name: `x-bind:${attribute.name}`,
			value: `"${attribute.value}"`
		};
		return attribute;
	});
	directives(el, attributes, original).map((handle) => {
		cleanupRunners.push(handle.runCleanups);
		handle();
	});
	return () => {
		while (cleanupRunners.length) cleanupRunners.pop()();
	};
}
var datas = {};
function data(name, callback) {
	datas[name] = callback;
}
function injectDataProviders(obj, context) {
	Object.entries(datas).forEach(([name, callback]) => {
		Object.defineProperty(obj, name, {
			get() {
				return (...args) => {
					return callback.bind(context)(...args);
				};
			},
			enumerable: false
		});
	});
	return obj;
}
var alpine_default = {
	get reactive() {
		return reactive;
	},
	get release() {
		return release;
	},
	get effect() {
		return effect;
	},
	get raw() {
		return raw;
	},
	get transaction() {
		return transaction;
	},
	version: "3.16.2",
	flushAndStopDeferringMutations,
	dontAutoEvaluateFunctions,
	disableEffectScheduling,
	startObservingMutations,
	stopObservingMutations,
	setReactivityEngine,
	onAttributeRemoved,
	onAttributesAdded,
	closestDataStack,
	skipDuringClone,
	onlyDuringClone,
	addRootSelector,
	addInitSelector,
	setErrorHandler,
	interceptClone,
	addScopeToNode,
	deferMutations,
	mapAttributes,
	evaluateLater,
	interceptInit,
	initInterceptors,
	injectMagics,
	setEvaluator,
	setRawEvaluator,
	mergeProxies,
	extractProp,
	findClosest,
	onElRemoved,
	closestRoot,
	destroyTree,
	interceptor,
	transition,
	setStyles,
	mutateDom,
	directive,
	entangle,
	throttle,
	debounce,
	evaluate,
	evaluateRaw,
	initTree,
	nextTick,
	prefixed: prefix,
	prefix: setPrefix,
	plugin,
	magic,
	store,
	start,
	clone,
	cloneNode,
	bound: getBinding,
	$data: scope,
	watch,
	walk,
	data,
	bind: bind2
};
function makeMap(str) {
	const map = /* @__PURE__ */ Object.create(null);
	for (const key of str.split(",")) map[key] = 1;
	return (val) => val in map;
}
Object.freeze({});
Object.freeze([]);
var extend = Object.assign;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var hasOwn = (val, key) => hasOwnProperty.call(val, key);
var isArray = Array.isArray;
var isMap = (val) => toTypeString(val) === "[object Map]";
var isString = (val) => typeof val === "string";
var isSymbol = (val) => typeof val === "symbol";
var isObject = (val) => val !== null && typeof val === "object";
var objectToString = Object.prototype.toString;
var toTypeString = (value) => objectToString.call(value);
var toRawType = (value) => {
	return toTypeString(value).slice(8, -1);
};
var isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
var cacheStringFunction = (fn) => {
	const cache = /* @__PURE__ */ Object.create(null);
	return (str) => {
		return cache[str] || (cache[str] = fn(str));
	};
};
var capitalize = cacheStringFunction((str) => {
	return str.charAt(0).toUpperCase() + str.slice(1);
});
var hasChanged = (value, oldValue) => !Object.is(value, oldValue);
function warn2(msg, ...args) {
	console.warn(`[Vue warn] ${msg}`, ...args);
}
var activeSub;
var pausedQueueEffects = /* @__PURE__ */ new WeakSet();
var ReactiveEffect = class {
	constructor(fn) {
		this.fn = fn;
		this.deps = void 0;
		this.depsTail = void 0;
		this.flags = 5;
		this.next = void 0;
		this.cleanup = void 0;
		this.scheduler = void 0;
	}
	pause() {
		this.flags |= 64;
	}
	resume() {
		if (this.flags & 64) {
			this.flags &= -65;
			if (pausedQueueEffects.has(this)) {
				pausedQueueEffects.delete(this);
				this.trigger();
			}
		}
	}
	/**
	* @internal
	*/
	notify() {
		if (this.flags & 2 && !(this.flags & 32)) return;
		if (!(this.flags & 8)) batch(this);
	}
	run() {
		if (!(this.flags & 1)) return this.fn();
		this.flags |= 2;
		cleanupEffect(this);
		prepareDeps(this);
		const prevEffect = activeSub;
		const prevShouldTrack = shouldTrack;
		activeSub = this;
		shouldTrack = true;
		try {
			return this.fn();
		} finally {
			if (activeSub !== this) warn2("Active effect was not restored correctly - this is likely a Vue internal bug.");
			cleanupDeps(this);
			activeSub = prevEffect;
			shouldTrack = prevShouldTrack;
			this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let link = this.deps; link; link = link.nextDep) removeSub(link);
			this.deps = this.depsTail = void 0;
			cleanupEffect(this);
			this.onStop && this.onStop();
			this.flags &= -2;
		}
	}
	trigger() {
		if (this.flags & 64) pausedQueueEffects.add(this);
		else if (this.scheduler) this.scheduler();
		else this.runIfDirty();
	}
	/**
	* @internal
	*/
	runIfDirty() {
		if (isDirty(this)) this.run();
	}
	get dirty() {
		return isDirty(this);
	}
};
var batchDepth = 0;
var batchedSub;
var batchedComputed;
function batch(sub, isComputed = false) {
	sub.flags |= 8;
	if (isComputed) {
		sub.next = batchedComputed;
		batchedComputed = sub;
		return;
	}
	sub.next = batchedSub;
	batchedSub = sub;
}
function startBatch() {
	batchDepth++;
}
function endBatch() {
	if (--batchDepth > 0) return;
	if (batchedComputed) {
		let e = batchedComputed;
		batchedComputed = void 0;
		while (e) {
			const next = e.next;
			e.next = void 0;
			e.flags &= -9;
			e = next;
		}
	}
	let error2;
	while (batchedSub) {
		let e = batchedSub;
		batchedSub = void 0;
		while (e) {
			const next = e.next;
			e.next = void 0;
			e.flags &= -9;
			if (e.flags & 1) try {
				e.trigger();
			} catch (err) {
				if (!error2) error2 = err;
			}
			e = next;
		}
	}
	if (error2) throw error2;
}
function prepareDeps(sub) {
	for (let link = sub.deps; link; link = link.nextDep) {
		link.version = -1;
		link.prevActiveLink = link.dep.activeLink;
		link.dep.activeLink = link;
	}
}
function cleanupDeps(sub) {
	let head;
	let tail = sub.depsTail;
	let link = tail;
	while (link) {
		const prev = link.prevDep;
		if (link.version === -1) {
			if (link === tail) tail = prev;
			removeSub(link);
			removeDep(link);
		} else head = link;
		link.dep.activeLink = link.prevActiveLink;
		link.prevActiveLink = void 0;
		link = prev;
	}
	sub.deps = head;
	sub.depsTail = tail;
}
function isDirty(sub) {
	for (let link = sub.deps; link; link = link.nextDep) if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) return true;
	if (sub._dirty) return true;
	return false;
}
function refreshComputed(computed) {
	if (computed.flags & 4 && !(computed.flags & 16)) return;
	computed.flags &= -17;
	if (computed.globalVersion === globalVersion) return;
	computed.globalVersion = globalVersion;
	if (!computed.isSSR && computed.flags & 128 && (!computed.deps && !computed._dirty || !isDirty(computed))) return;
	computed.flags |= 2;
	const dep = computed.dep;
	const prevSub = activeSub;
	const prevShouldTrack = shouldTrack;
	activeSub = computed;
	shouldTrack = true;
	try {
		prepareDeps(computed);
		const value = computed.fn(computed._value);
		if (dep.version === 0 || hasChanged(value, computed._value)) {
			computed.flags |= 128;
			computed._value = value;
			dep.version++;
		}
	} catch (err) {
		dep.version++;
		throw err;
	} finally {
		activeSub = prevSub;
		shouldTrack = prevShouldTrack;
		cleanupDeps(computed);
		computed.flags &= -3;
	}
}
function removeSub(link, soft = false) {
	const { dep, prevSub, nextSub } = link;
	if (prevSub) {
		prevSub.nextSub = nextSub;
		link.prevSub = void 0;
	}
	if (nextSub) {
		nextSub.prevSub = prevSub;
		link.nextSub = void 0;
	}
	if (dep.subsHead === link) dep.subsHead = nextSub;
	if (dep.subs === link) {
		dep.subs = prevSub;
		if (!prevSub && dep.computed) {
			dep.computed.flags &= -5;
			for (let l = dep.computed.deps; l; l = l.nextDep) removeSub(l, true);
		}
	}
	if (!soft && !--dep.sc && dep.map) dep.map.delete(dep.key);
}
function removeDep(link) {
	const { prevDep, nextDep } = link;
	if (prevDep) {
		prevDep.nextDep = nextDep;
		link.prevDep = void 0;
	}
	if (nextDep) {
		nextDep.prevDep = prevDep;
		link.nextDep = void 0;
	}
}
function effect2(fn, options) {
	if (fn.effect instanceof ReactiveEffect) fn = fn.effect.fn;
	const e = new ReactiveEffect(fn);
	if (options) extend(e, options);
	try {
		e.run();
	} catch (err) {
		e.stop();
		throw err;
	}
	const runner = e.run.bind(e);
	runner.effect = e;
	return runner;
}
function stop(runner) {
	runner.effect.stop();
}
var shouldTrack = true;
var trackStack = [];
function pauseTracking() {
	trackStack.push(shouldTrack);
	shouldTrack = false;
}
function resetTracking() {
	const last = trackStack.pop();
	shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e) {
	const { cleanup } = e;
	e.cleanup = void 0;
	if (cleanup) {
		const prevSub = activeSub;
		activeSub = void 0;
		try {
			cleanup();
		} finally {
			activeSub = prevSub;
		}
	}
}
var globalVersion = 0;
var Link = class {
	constructor(sub, dep) {
		this.sub = sub;
		this.dep = dep;
		this.version = dep.version;
		this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
};
var Dep = class {
	constructor(computed) {
		this.computed = computed;
		this.version = 0;
		this.activeLink = void 0;
		this.subs = void 0;
		this.map = void 0;
		this.key = void 0;
		this.sc = 0;
		this.__v_skip = true;
		this.subsHead = void 0;
	}
	track(debugInfo) {
		if (!activeSub || !shouldTrack || activeSub === this.computed) return;
		let link = this.activeLink;
		if (link === void 0 || link.sub !== activeSub) {
			link = this.activeLink = new Link(activeSub, this);
			if (!activeSub.deps) activeSub.deps = activeSub.depsTail = link;
			else {
				link.prevDep = activeSub.depsTail;
				activeSub.depsTail.nextDep = link;
				activeSub.depsTail = link;
			}
			addSub(link);
		} else if (link.version === -1) {
			link.version = this.version;
			if (link.nextDep) {
				const next = link.nextDep;
				next.prevDep = link.prevDep;
				if (link.prevDep) link.prevDep.nextDep = next;
				link.prevDep = activeSub.depsTail;
				link.nextDep = void 0;
				activeSub.depsTail.nextDep = link;
				activeSub.depsTail = link;
				if (activeSub.deps === link) activeSub.deps = next;
			}
		}
		if (activeSub.onTrack) activeSub.onTrack(extend({ effect: activeSub }, debugInfo));
		return link;
	}
	trigger(debugInfo) {
		this.version++;
		globalVersion++;
		this.notify(debugInfo);
	}
	notify(debugInfo) {
		startBatch();
		try {
			for (let head = this.subsHead; head; head = head.nextSub) if (head.sub.onTrigger && !(head.sub.flags & 8)) head.sub.onTrigger(extend({ effect: head.sub }, debugInfo));
			for (let link = this.subs; link; link = link.prevSub) if (link.sub.notify()) link.sub.dep.notify();
		} finally {
			endBatch();
		}
	}
};
function addSub(link) {
	link.dep.sc++;
	if (link.sub.flags & 4) {
		const computed = link.dep.computed;
		if (computed && !link.dep.subs) {
			computed.flags |= 20;
			for (let l = computed.deps; l; l = l.nextDep) addSub(l);
		}
		const currentTail = link.dep.subs;
		if (currentTail !== link) {
			link.prevSub = currentTail;
			if (currentTail) currentTail.nextSub = link;
		}
		if (link.dep.subsHead === void 0) link.dep.subsHead = link;
		link.dep.subs = link;
	}
}
var targetMap = /* @__PURE__ */ new WeakMap();
var ITERATE_KEY = /* @__PURE__ */ Symbol("Object iterate");
var MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol("Map keys iterate");
var ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol("Array iterate");
function track(target, type, key) {
	if (shouldTrack && activeSub) {
		let depsMap = targetMap.get(target);
		if (!depsMap) targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
		let dep = depsMap.get(key);
		if (!dep) {
			depsMap.set(key, dep = new Dep());
			dep.map = depsMap;
			dep.key = key;
		}
		dep.track({
			target,
			type,
			key
		});
	}
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
	const depsMap = targetMap.get(target);
	if (!depsMap) {
		globalVersion++;
		return;
	}
	const run = (dep) => {
		if (dep) dep.trigger({
			target,
			type,
			key,
			newValue,
			oldValue,
			oldTarget
		});
	};
	startBatch();
	if (type === "clear") depsMap.forEach(run);
	else {
		const targetIsArray = isArray(target);
		const isArrayIndex = targetIsArray && isIntegerKey(key);
		if (targetIsArray && key === "length") {
			const newLength = Number(newValue);
			depsMap.forEach((dep, key2) => {
				if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) run(dep);
			});
		} else {
			if (key !== void 0 || depsMap.has(void 0)) run(depsMap.get(key));
			if (isArrayIndex) run(depsMap.get(ARRAY_ITERATE_KEY));
			switch (type) {
				case "add":
					if (!targetIsArray) {
						run(depsMap.get(ITERATE_KEY));
						if (isMap(target)) run(depsMap.get(MAP_KEY_ITERATE_KEY));
					} else if (isArrayIndex) run(depsMap.get("length"));
					break;
				case "delete":
					if (!targetIsArray) {
						run(depsMap.get(ITERATE_KEY));
						if (isMap(target)) run(depsMap.get(MAP_KEY_ITERATE_KEY));
					}
					break;
				case "set": if (isMap(target)) run(depsMap.get(ITERATE_KEY));
			}
		}
	}
	endBatch();
}
function reactiveReadArray(array) {
	const raw2 = toRaw(array);
	if (raw2 === array) return raw2;
	track(raw2, "iterate", ARRAY_ITERATE_KEY);
	return isShallow(array) ? raw2 : raw2.map(toReactive);
}
function shallowReadArray(arr) {
	track(arr = toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
	return arr;
}
function toWrapped(target, item) {
	if (isReadonly(target)) return isReactive2(target) ? toReadonly(toReactive(item)) : toReadonly(item);
	return toReactive(item);
}
var arrayInstrumentations = {
	__proto__: null,
	[Symbol.iterator]() {
		return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
	},
	concat(...args) {
		return reactiveReadArray(this).concat(...args.map((x) => isArray(x) ? reactiveReadArray(x) : x));
	},
	entries() {
		return iterator(this, "entries", (value) => {
			value[1] = toWrapped(this, value[1]);
			return value;
		});
	},
	every(fn, thisArg) {
		return apply(this, "every", fn, thisArg, void 0, arguments);
	},
	filter(fn, thisArg) {
		return apply(this, "filter", fn, thisArg, (v) => v.map((item) => toWrapped(this, item)), arguments);
	},
	find(fn, thisArg) {
		return apply(this, "find", fn, thisArg, (item) => toWrapped(this, item), arguments);
	},
	findIndex(fn, thisArg) {
		return apply(this, "findIndex", fn, thisArg, void 0, arguments);
	},
	findLast(fn, thisArg) {
		return apply(this, "findLast", fn, thisArg, (item) => toWrapped(this, item), arguments);
	},
	findLastIndex(fn, thisArg) {
		return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
	},
	forEach(fn, thisArg) {
		return apply(this, "forEach", fn, thisArg, void 0, arguments);
	},
	includes(...args) {
		return searchProxy(this, "includes", args);
	},
	indexOf(...args) {
		return searchProxy(this, "indexOf", args);
	},
	join(separator) {
		return reactiveReadArray(this).join(separator);
	},
	lastIndexOf(...args) {
		return searchProxy(this, "lastIndexOf", args);
	},
	map(fn, thisArg) {
		return apply(this, "map", fn, thisArg, void 0, arguments);
	},
	pop() {
		return noTracking(this, "pop");
	},
	push(...args) {
		return noTracking(this, "push", args);
	},
	reduce(fn, ...args) {
		return reduce(this, "reduce", fn, args);
	},
	reduceRight(fn, ...args) {
		return reduce(this, "reduceRight", fn, args);
	},
	shift() {
		return noTracking(this, "shift");
	},
	some(fn, thisArg) {
		return apply(this, "some", fn, thisArg, void 0, arguments);
	},
	splice(...args) {
		return noTracking(this, "splice", args);
	},
	toReversed() {
		return reactiveReadArray(this).toReversed();
	},
	toSorted(comparer) {
		return reactiveReadArray(this).toSorted(comparer);
	},
	toSpliced(...args) {
		return reactiveReadArray(this).toSpliced(...args);
	},
	unshift(...args) {
		return noTracking(this, "unshift", args);
	},
	values() {
		return iterator(this, "values", (item) => toWrapped(this, item));
	}
};
function iterator(self2, method, wrapValue) {
	const arr = shallowReadArray(self2);
	const iter = arr[method]();
	if (arr !== self2 && !isShallow(self2)) {
		iter._next = iter.next;
		iter.next = () => {
			const result = iter._next();
			if (!result.done) result.value = wrapValue(result.value);
			return result;
		};
	}
	return iter;
}
var arrayProto = Array.prototype;
function apply(self2, method, fn, thisArg, wrappedRetFn, args) {
	const arr = shallowReadArray(self2);
	const needsWrap = arr !== self2 && !isShallow(self2);
	const methodFn = arr[method];
	if (methodFn !== arrayProto[method]) {
		const result2 = methodFn.apply(self2, args);
		return needsWrap ? toReactive(result2) : result2;
	}
	let wrappedFn = fn;
	if (arr !== self2) {
		if (needsWrap) wrappedFn = function(item, index) {
			return fn.call(this, toWrapped(self2, item), index, self2);
		};
		else if (fn.length > 2) wrappedFn = function(item, index) {
			return fn.call(this, item, index, self2);
		};
	}
	const result = methodFn.call(arr, wrappedFn, thisArg);
	return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self2, method, fn, args) {
	const arr = shallowReadArray(self2);
	const needsWrap = arr !== self2 && !isShallow(self2);
	let wrappedFn = fn;
	let wrapInitialAccumulator = false;
	if (arr !== self2) {
		if (needsWrap) {
			wrapInitialAccumulator = args.length === 0;
			wrappedFn = function(acc, item, index) {
				if (wrapInitialAccumulator) {
					wrapInitialAccumulator = false;
					acc = toWrapped(self2, acc);
				}
				return fn.call(this, acc, toWrapped(self2, item), index, self2);
			};
		} else if (fn.length > 3) wrappedFn = function(acc, item, index) {
			return fn.call(this, acc, item, index, self2);
		};
	}
	const result = arr[method](wrappedFn, ...args);
	return wrapInitialAccumulator ? toWrapped(self2, result) : result;
}
function searchProxy(self2, method, args) {
	const arr = toRaw(self2);
	track(arr, "iterate", ARRAY_ITERATE_KEY);
	const res = arr[method](...args);
	if ((res === -1 || res === false) && isProxy(args[0])) {
		args[0] = toRaw(args[0]);
		return arr[method](...args);
	}
	return res;
}
function noTracking(self2, method, args = []) {
	pauseTracking();
	startBatch();
	const res = toRaw(self2)[method].apply(self2, args);
	endBatch();
	resetTracking();
	return res;
}
var isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
var builtInSymbols = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol));
function hasOwnProperty2(key) {
	if (!isSymbol(key)) key = String(key);
	const obj = toRaw(this);
	track(obj, "has", key);
	return obj.hasOwnProperty(key);
}
var BaseReactiveHandler = class {
	constructor(_isReadonly = false, _isShallow = false) {
		this._isReadonly = _isReadonly;
		this._isShallow = _isShallow;
	}
	get(target, key, receiver) {
		if (key === "__v_skip") return target["__v_skip"];
		const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
		if (key === "__v_isReactive") return !isReadonly2;
		else if (key === "__v_isReadonly") return isReadonly2;
		else if (key === "__v_isShallow") return isShallow2;
		else if (key === "__v_raw") {
			if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) return target;
			return;
		}
		const targetIsArray = isArray(target);
		if (!isReadonly2) {
			let fn;
			if (targetIsArray && (fn = arrayInstrumentations[key])) return fn;
			if (key === "hasOwnProperty") return hasOwnProperty2;
		}
		const res = Reflect.get(target, key, isRef(target) ? target : receiver);
		if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) return res;
		if (!isReadonly2) track(target, "get", key);
		if (isShallow2) return res;
		if (isRef(res)) {
			const value = targetIsArray && isIntegerKey(key) ? res : res.value;
			return isReadonly2 && isObject(value) ? readonly(value) : value;
		}
		if (isObject(res)) return isReadonly2 ? readonly(res) : reactive2(res);
		return res;
	}
};
var MutableReactiveHandler = class extends BaseReactiveHandler {
	constructor(isShallow2 = false) {
		super(false, isShallow2);
	}
	set(target, key, value, receiver) {
		let oldValue = target[key];
		const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key);
		if (!this._isShallow) {
			const isOldValueReadonly = isReadonly(oldValue);
			if (!isShallow(value) && !isReadonly(value)) {
				oldValue = toRaw(oldValue);
				value = toRaw(value);
			}
			if (!isArrayWithIntegerKey && isRef(oldValue) && !isRef(value)) {
				if (isOldValueReadonly) {
					warn2(`Set operation on key "${String(key)}" failed: target is readonly.`, target[key]);
					return true;
				} else {
					oldValue.value = value;
					return true;
				}
			}
		}
		const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
		const result = Reflect.set(target, key, value, isRef(target) ? target : receiver);
		if (target === toRaw(receiver) && result) {
			if (!hadKey) trigger(target, "add", key, value);
			else if (hasChanged(value, oldValue)) trigger(target, "set", key, value, oldValue);
		}
		return result;
	}
	deleteProperty(target, key) {
		const hadKey = hasOwn(target, key);
		const oldValue = target[key];
		const result = Reflect.deleteProperty(target, key);
		if (result && hadKey) trigger(target, "delete", key, void 0, oldValue);
		return result;
	}
	has(target, key) {
		const result = Reflect.has(target, key);
		if (!isSymbol(key) || !builtInSymbols.has(key)) track(target, "has", key);
		return result;
	}
	ownKeys(target) {
		track(target, "iterate", isArray(target) ? "length" : ITERATE_KEY);
		return Reflect.ownKeys(target);
	}
};
var ReadonlyReactiveHandler = class extends BaseReactiveHandler {
	constructor(isShallow2 = false) {
		super(true, isShallow2);
	}
	set(target, key) {
		warn2(`Set operation on key "${String(key)}" failed: target is readonly.`, target);
		return true;
	}
	deleteProperty(target, key) {
		warn2(`Delete operation on key "${String(key)}" failed: target is readonly.`, target);
		return true;
	}
};
var mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
var readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
var toShallow = (value) => value;
var getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
	return function(...args) {
		const target = this["__v_raw"];
		const rawTarget = toRaw(target);
		const targetIsMap = isMap(rawTarget);
		const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
		const isKeyOnly = method === "keys" && targetIsMap;
		const innerIterator = target[method](...args);
		const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
		!isReadonly2 && track(rawTarget, "iterate", isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
		return extend(Object.create(innerIterator), { next() {
			const { value, done } = innerIterator.next();
			return done ? {
				value,
				done
			} : {
				value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
				done
			};
		} });
	};
}
function createReadonlyMethod(type) {
	return function(...args) {
		{
			const key = args[0] ? `on key "${args[0]}" ` : ``;
			warn2(`${capitalize(type)} operation ${key}failed: target is readonly.`, toRaw(this));
		}
		return type === "delete" ? false : type === "clear" ? void 0 : this;
	};
}
function createInstrumentations(readonly2, shallow) {
	const instrumentations = {
		get(key) {
			const target = this["__v_raw"];
			const rawTarget = toRaw(target);
			const rawKey = toRaw(key);
			if (!readonly2) {
				if (hasChanged(key, rawKey)) track(rawTarget, "get", key);
				track(rawTarget, "get", rawKey);
			}
			const { has } = getProto(rawTarget);
			const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
			if (has.call(rawTarget, key)) return wrap(target.get(key));
			else if (has.call(rawTarget, rawKey)) return wrap(target.get(rawKey));
			else if (target !== rawTarget) target.get(key);
		},
		get size() {
			const target = this["__v_raw"];
			!readonly2 && track(toRaw(target), "iterate", ITERATE_KEY);
			return target.size;
		},
		has(key) {
			const target = this["__v_raw"];
			const rawTarget = toRaw(target);
			const rawKey = toRaw(key);
			if (!readonly2) {
				if (hasChanged(key, rawKey)) track(rawTarget, "has", key);
				track(rawTarget, "has", rawKey);
			}
			return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
		},
		forEach(callback, thisArg) {
			const observed = this;
			const target = observed["__v_raw"];
			const rawTarget = toRaw(target);
			const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
			!readonly2 && track(rawTarget, "iterate", ITERATE_KEY);
			return target.forEach((value, key) => {
				return callback.call(thisArg, wrap(value), wrap(key), observed);
			});
		}
	};
	extend(instrumentations, readonly2 ? {
		add: createReadonlyMethod("add"),
		set: createReadonlyMethod("set"),
		delete: createReadonlyMethod("delete"),
		clear: createReadonlyMethod("clear")
	} : {
		add(value) {
			const target = toRaw(this);
			const proto = getProto(target);
			const rawValue = toRaw(value);
			const valueToAdd = !shallow && !isShallow(value) && !isReadonly(value) ? rawValue : value;
			if (!(proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue))) {
				target.add(valueToAdd);
				trigger(target, "add", valueToAdd, valueToAdd);
			}
			return this;
		},
		set(key, value) {
			if (!shallow && !isShallow(value) && !isReadonly(value)) value = toRaw(value);
			const target = toRaw(this);
			const { has, get: get2 } = getProto(target);
			let hadKey = has.call(target, key);
			if (!hadKey) {
				key = toRaw(key);
				hadKey = has.call(target, key);
			} else checkIdentityKeys(target, has, key);
			const oldValue = get2.call(target, key);
			target.set(key, value);
			if (!hadKey) trigger(target, "add", key, value);
			else if (hasChanged(value, oldValue)) trigger(target, "set", key, value, oldValue);
			return this;
		},
		delete(key) {
			const target = toRaw(this);
			const { has, get: get2 } = getProto(target);
			let hadKey = has.call(target, key);
			if (!hadKey) {
				key = toRaw(key);
				hadKey = has.call(target, key);
			} else checkIdentityKeys(target, has, key);
			const oldValue = get2 ? get2.call(target, key) : void 0;
			const result = target.delete(key);
			if (hadKey) trigger(target, "delete", key, void 0, oldValue);
			return result;
		},
		clear() {
			const target = toRaw(this);
			const hadItems = target.size !== 0;
			const oldTarget = isMap(target) ? new Map(target) : new Set(target);
			const result = target.clear();
			if (hadItems) trigger(target, "clear", void 0, void 0, oldTarget);
			return result;
		}
	});
	[
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((method) => {
		instrumentations[method] = createIterableMethod(method, readonly2, shallow);
	});
	return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
	const instrumentations = createInstrumentations(isReadonly2, shallow);
	return (target, key, receiver) => {
		if (key === "__v_isReactive") return !isReadonly2;
		else if (key === "__v_isReadonly") return isReadonly2;
		else if (key === "__v_raw") return target;
		return Reflect.get(hasOwn(instrumentations, key) && key in target ? instrumentations : target, key, receiver);
	};
}
var mutableCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(false, false) };
var readonlyCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(true, false) };
function checkIdentityKeys(target, has, key) {
	const rawKey = toRaw(key);
	if (rawKey !== key && has.call(target, rawKey)) {
		const type = toRawType(target);
		warn2(`Reactive ${type} contains both the raw and reactive versions of the same object${type === `Map` ? ` as keys` : ``}, which can lead to inconsistencies. Avoid differentiating between the raw and reactive versions of an object and only use the reactive version if possible.`);
	}
}
var reactiveMap = /* @__PURE__ */ new WeakMap();
var shallowReactiveMap = /* @__PURE__ */ new WeakMap();
var readonlyMap = /* @__PURE__ */ new WeakMap();
var shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
	switch (rawType) {
		case "Object":
		case "Array": return 1;
		case "Map":
		case "Set":
		case "WeakMap":
		case "WeakSet": return 2;
		default: return 0;
	}
}
function reactive2(target) {
	if (/* @__PURE__ */ isReadonly(target)) return target;
	return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap);
}
function readonly(target) {
	return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers, readonlyMap);
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
	if (!isObject(target)) {
		warn2(`value cannot be made ${isReadonly2 ? "readonly" : "reactive"}: ${String(target)}`);
		return target;
	}
	if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) return target;
	if (target["__v_skip"] || !Object.isExtensible(target)) return target;
	const existingProxy = proxyMap.get(target);
	if (existingProxy) return existingProxy;
	const targetType = targetTypeMap(toRawType(target));
	if (targetType === 0) return target;
	const proxy = new Proxy(target, targetType === 2 ? collectionHandlers : baseHandlers);
	proxyMap.set(target, proxy);
	return proxy;
}
function isReactive2(value) {
	if (/* @__PURE__ */ isReadonly(value)) return /* @__PURE__ */ isReactive2(value["__v_raw"]);
	return !!(value && value["__v_isReactive"]);
}
function isReadonly(value) {
	return !!(value && value["__v_isReadonly"]);
}
function isShallow(value) {
	return !!(value && value["__v_isShallow"]);
}
function isProxy(value) {
	return value ? !!value["__v_raw"] : false;
}
function toRaw(observed) {
	const raw2 = observed && observed["__v_raw"];
	return raw2 ? /* @__PURE__ */ toRaw(raw2) : observed;
}
var toReactive = (value) => isObject(value) ? /* @__PURE__ */ reactive2(value) : value;
var toReadonly = (value) => isObject(value) ? /* @__PURE__ */ readonly(value) : value;
function isRef(r) {
	return r ? r["__v_isRef"] === true : false;
}
magic("nextTick", () => nextTick);
magic("dispatch", (el) => dispatch.bind(dispatch, el));
magic("watch", (el, { evaluateLater: evaluateLater2, cleanup }) => (key, callback) => {
	let evaluate2 = evaluateLater2(key);
	let getter = () => {
		let value;
		evaluate2((i) => value = i);
		return value;
	};
	cleanup(watch(getter, callback));
});
magic("store", getStores);
magic("data", (el) => scope(el));
magic("root", (el) => closestRoot(el));
magic("refs", (el) => {
	if (el._x_refs_proxy) return el._x_refs_proxy;
	el._x_refs_proxy = mergeProxies(getArrayOfRefObject(el));
	return el._x_refs_proxy;
});
function getArrayOfRefObject(el) {
	let refObjects = [];
	findClosest(el, (i) => {
		if (i._x_refs) refObjects.push(i._x_refs);
	});
	return refObjects;
}
var globalIdMemo = {};
function findAndIncrementId(name) {
	if (!globalIdMemo[name]) globalIdMemo[name] = 0;
	return ++globalIdMemo[name];
}
function closestIdRoot(el, name) {
	return findClosest(el, (element) => {
		if (element._x_ids && element._x_ids[name]) return true;
	});
}
function setIdRoot(el, name) {
	if (!el._x_ids) el._x_ids = {};
	if (!el._x_ids[name]) el._x_ids[name] = findAndIncrementId(name);
}
magic("id", (el, { cleanup }) => (name, key = null) => {
	return cacheIdByNameOnElement(el, `${name}${key ? `-${key}` : ""}`, cleanup, () => {
		let root = closestIdRoot(el, name);
		let id = root ? root._x_ids[name] : findAndIncrementId(name);
		return key ? `${name}-${id}-${key}` : `${name}-${id}`;
	});
});
interceptClone((from, to) => {
	if (from._x_id) to._x_id = from._x_id;
});
function cacheIdByNameOnElement(el, cacheKey, cleanup, callback) {
	if (!el._x_id) el._x_id = {};
	if (el._x_id[cacheKey]) return el._x_id[cacheKey];
	let output = callback();
	el._x_id[cacheKey] = output;
	cleanup(() => {
		delete el._x_id[cacheKey];
	});
	return output;
}
magic("el", (el) => el);
warnMissingPluginMagic("Focus", "focus", "focus");
warnMissingPluginMagic("Persist", "persist", "persist");
function warnMissingPluginMagic(name, magicName, slug) {
	magic(magicName, (el) => warn(`You can't use [$${magicName}] without first installing the "${name}" plugin here: https://alpinejs.dev/plugins/${slug}`, el));
}
directive("modelable", (el, { expression }, { effect: effect3, evaluateLater: evaluateLater2, cleanup }) => {
	let func = evaluateLater2(expression);
	let innerGet = () => {
		let result;
		func((i) => result = i);
		return result;
	};
	let evaluateInnerSet = evaluateLater2(`${expression} = __placeholder`);
	let innerSet = (val) => evaluateInnerSet(() => {}, { scope: { "__placeholder": val } });
	innerSet(innerGet());
	queueMicrotask(() => {
		if (!el._x_model) return;
		el._x_removeModelListeners["default"]();
		let outerGet = el._x_model.get;
		let outerSet = el._x_model.setWithModifiers;
		cleanup(entangle({
			get() {
				return outerGet();
			},
			set(value) {
				outerSet(value);
			}
		}, {
			get() {
				return innerGet();
			},
			set(value) {
				innerSet(value);
			}
		}));
	});
});
directive("teleport", (el, { modifiers, expression }, { cleanup }) => {
	if (el.tagName.toLowerCase() !== "template") warn("x-teleport can only be used on a <template> tag", el);
	let target = getTarget(expression);
	let clone2 = el.content.cloneNode(true).firstElementChild;
	el._x_teleport = clone2;
	clone2._x_teleportBack = el;
	el.setAttribute("data-teleport-template", true);
	clone2.setAttribute("data-teleport-target", true);
	if (el._x_forwardEvents) el._x_forwardEvents.forEach((eventName) => {
		clone2.addEventListener(eventName, (e) => {
			e.stopPropagation();
			el.dispatchEvent(new e.constructor(e.type, e));
		});
	});
	addScopeToNode(clone2, {}, el);
	let placeInDom = (clone3, target2, modifiers2) => {
		if (modifiers2.includes("prepend")) target2.parentNode.insertBefore(clone3, target2);
		else if (modifiers2.includes("append")) target2.parentNode.insertBefore(clone3, target2.nextSibling);
		else target2.appendChild(clone3);
	};
	mutateDom(() => {
		skipDuringClone(() => {
			placeInDom(clone2, target, modifiers);
			initTree(clone2);
		})();
	});
	el._x_teleportPutBack = () => {
		let target2 = getTarget(expression);
		mutateDom(() => {
			placeInDom(el._x_teleport, target2, modifiers);
		});
	};
	cleanup(() => mutateDom(() => {
		clone2.remove();
		destroyTree(clone2);
	}));
});
var teleportContainerDuringClone = document.createElement("div");
function getTarget(expression) {
	let target = skipDuringClone(() => {
		return document.querySelector(expression);
	}, () => {
		return teleportContainerDuringClone;
	})();
	if (!target) warn(`Cannot find x-teleport element for selector: "${expression}"`);
	return target;
}
var handler = () => {};
handler.inline = (el, { modifiers }, { cleanup }) => {
	modifiers.includes("self") ? el._x_ignoreSelf = true : el._x_ignore = true;
	cleanup(() => {
		modifiers.includes("self") ? delete el._x_ignoreSelf : delete el._x_ignore;
	});
};
directive("ignore", handler);
directive("effect", skipDuringClone((el, { expression }, { effect: effect3 }) => {
	effect3(evaluateLater(el, expression));
}));
function on(el, event, modifiers, callback) {
	let listenerTarget = el;
	let handler4 = (e) => callback(e);
	let options = {};
	let wrapHandler = (callback2, wrapper) => (e) => wrapper(callback2, e);
	if (modifiers.includes("dot")) event = dotSyntax(event);
	if (modifiers.includes("camel")) event = camelCase2(event);
	if (modifiers.includes("capture")) options.capture = true;
	if (modifiers.includes("window")) listenerTarget = window;
	if (modifiers.includes("document")) listenerTarget = document;
	if (modifiers.includes("passive")) options.passive = modifiers[modifiers.indexOf("passive") + 1] !== "false";
	handler4 = addDebounceOrThrottle(modifiers, handler4);
	if (modifiers.includes("prevent")) handler4 = wrapHandler(handler4, (next, e) => {
		e.preventDefault();
		next(e);
	});
	if (modifiers.includes("stop")) handler4 = wrapHandler(handler4, (next, e) => {
		e.stopPropagation();
		next(e);
	});
	if (modifiers.includes("once")) handler4 = wrapHandler(handler4, (next, e) => {
		next(e);
		listenerTarget.removeEventListener(event, handler4, options);
	});
	if (modifiers.includes("away") || modifiers.includes("outside")) {
		listenerTarget = document;
		handler4 = wrapHandler(handler4, (next, e) => {
			if (el.contains(e.target)) return;
			if (e.target.isConnected === false) return;
			if (el.offsetWidth < 1 && el.offsetHeight < 1) return;
			if (el._x_isShown === false) return;
			next(e);
		});
	}
	if (modifiers.includes("self")) handler4 = wrapHandler(handler4, (next, e) => {
		e.target === el && next(e);
	});
	if (event === "submit") handler4 = wrapHandler(handler4, (next, e) => {
		if (e.target._x_pendingModelUpdates) e.target._x_pendingModelUpdates.forEach((fn) => fn());
		next(e);
	});
	if (isKeyEvent(event) || isClickEvent(event)) handler4 = wrapHandler(handler4, (next, e) => {
		if (isListeningForASpecificKeyThatHasntBeenPressed(e, modifiers)) return;
		next(e);
	});
	listenerTarget.addEventListener(event, handler4, options);
	return () => {
		listenerTarget.removeEventListener(event, handler4, options);
	};
}
function addDebounceOrThrottle(modifiers, handler4) {
	if (modifiers.includes("debounce")) {
		let nextModifier = modifiers[modifiers.indexOf("debounce") + 1] || "invalid-wait";
		let wait = isNumeric(nextModifier.split("ms")[0]) ? Number(nextModifier.split("ms")[0]) : 250;
		handler4 = debounce(handler4, wait);
	}
	if (modifiers.includes("throttle")) {
		let nextModifier = modifiers[modifiers.indexOf("throttle") + 1] || "invalid-wait";
		let wait = isNumeric(nextModifier.split("ms")[0]) ? Number(nextModifier.split("ms")[0]) : 250;
		handler4 = throttle(handler4, wait);
	}
	return handler4;
}
function dotSyntax(subject) {
	return subject.replace(/-/g, ".");
}
function camelCase2(subject) {
	return subject.toLowerCase().replace(/-(\w)/g, (match, char) => char.toUpperCase());
}
function isNumeric(subject) {
	return !Array.isArray(subject) && !isNaN(subject);
}
function kebabCase2(subject) {
	if ([" ", "_"].includes(subject)) return subject;
	return subject.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[_\s]/, "-").toLowerCase();
}
function isKeyEvent(event) {
	return ["keydown", "keyup"].includes(event);
}
function isClickEvent(event) {
	return [
		"contextmenu",
		"click",
		"mouse"
	].some((i) => event.includes(i));
}
function isListeningForASpecificKeyThatHasntBeenPressed(e, modifiers) {
	let keyModifiers = modifiers.filter((i) => {
		return ![
			"window",
			"document",
			"prevent",
			"stop",
			"once",
			"capture",
			"self",
			"away",
			"outside",
			"passive",
			"preserve-scroll",
			"blur",
			"change",
			"lazy"
		].includes(i);
	});
	if (keyModifiers.includes("debounce")) {
		let debounceIndex = keyModifiers.indexOf("debounce");
		keyModifiers.splice(debounceIndex, isNumeric((keyModifiers[debounceIndex + 1] || "invalid-wait").split("ms")[0]) ? 2 : 1);
	}
	if (keyModifiers.includes("throttle")) {
		let debounceIndex = keyModifiers.indexOf("throttle");
		keyModifiers.splice(debounceIndex, isNumeric((keyModifiers[debounceIndex + 1] || "invalid-wait").split("ms")[0]) ? 2 : 1);
	}
	if (keyModifiers.length === 0) return false;
	if (keyModifiers.length === 1 && keyToModifiers(e.key).includes(keyModifiers[0])) return false;
	const selectedSystemKeyModifiers = [
		"ctrl",
		"shift",
		"alt",
		"meta",
		"cmd",
		"super"
	].filter((modifier) => keyModifiers.includes(modifier));
	keyModifiers = keyModifiers.filter((i) => !selectedSystemKeyModifiers.includes(i));
	if (selectedSystemKeyModifiers.length > 0) {
		if (selectedSystemKeyModifiers.filter((modifier) => {
			if (modifier === "cmd" || modifier === "super") modifier = "meta";
			return e[`${modifier}Key`];
		}).length === selectedSystemKeyModifiers.length) {
			if (isClickEvent(e.type)) return false;
			if (keyToModifiers(e.key).includes(keyModifiers[0])) return false;
		}
	}
	return true;
}
function keyToModifiers(key) {
	if (!key) return [];
	key = kebabCase2(key);
	let modifierToKeyMap = {
		"ctrl": "control",
		"slash": "/",
		"space": " ",
		"spacebar": " ",
		"cmd": "meta",
		"esc": "escape",
		"up": "arrow-up",
		"down": "arrow-down",
		"left": "arrow-left",
		"right": "arrow-right",
		"period": ".",
		"comma": ",",
		"equal": "=",
		"minus": "-",
		"underscore": "_"
	};
	modifierToKeyMap[key] = key;
	return Object.keys(modifierToKeyMap).map((modifier) => {
		if (modifierToKeyMap[modifier] === key) return modifier;
	}).filter((modifier) => modifier);
}
directive("model", (el, { modifiers, expression }, { effect: effect3, cleanup }) => {
	let scopeTarget = el;
	if (modifiers.includes("parent")) scopeTarget = findClosest(el, (element) => element !== el);
	let evaluateGet = evaluateLater(scopeTarget, expression);
	let evaluateSet;
	if (typeof expression === "string") evaluateSet = evaluateLater(scopeTarget, `${expression} = __placeholder`);
	else if (typeof expression === "function" && typeof expression() === "string") evaluateSet = evaluateLater(scopeTarget, `${expression()} = __placeholder`);
	else evaluateSet = () => {};
	let getValue = () => {
		let result;
		evaluateGet((value) => result = value);
		return isGetterSetter(result) ? result.get() : result;
	};
	let setValue = (value) => {
		let result;
		evaluateGet((value2) => result = value2);
		if (isGetterSetter(result)) result.set(value);
		else evaluateSet(() => {}, { scope: { "__placeholder": value } });
	};
	if (typeof expression === "string" && el.type === "radio") mutateDom(() => {
		if (!el.hasAttribute("name")) el.setAttribute("name", expression);
	});
	let hasChangeModifier = modifiers.includes("change") || modifiers.includes("lazy");
	let hasBlurModifier = modifiers.includes("blur");
	let hasEnterModifier = modifiers.includes("enter");
	let hasExplicitEventModifiers = hasChangeModifier || hasBlurModifier || hasEnterModifier;
	let removeListener;
	if (isCloning) removeListener = () => {};
	else if (hasExplicitEventModifiers) {
		let listeners = [];
		let syncValue = (e) => setValue(getInputValue(el, modifiers, e, getValue()));
		if (hasChangeModifier) listeners.push(on(el, "change", modifiers, syncValue));
		if (hasBlurModifier) {
			listeners.push(on(el, "blur", modifiers, syncValue));
			if (el.form) {
				let form = el.form;
				let syncCallback = () => syncValue({ target: el });
				if (!form._x_pendingModelUpdates) form._x_pendingModelUpdates = [];
				form._x_pendingModelUpdates.push(syncCallback);
				cleanup(() => {
					if (form._x_pendingModelUpdates) form._x_pendingModelUpdates.splice(form._x_pendingModelUpdates.indexOf(syncCallback), 1);
				});
			}
		}
		if (hasEnterModifier) listeners.push(on(el, "keydown", modifiers, (e) => {
			if (e.key === "Enter") syncValue(e);
		}));
		removeListener = () => listeners.forEach((remove2) => remove2());
	} else removeListener = on(el, el.tagName.toLowerCase() === "select" || ["checkbox", "radio"].includes(el.type) ? "change" : "input", modifiers, (e) => {
		setValue(getInputValue(el, modifiers, e, getValue()));
	});
	if (modifiers.includes("fill")) {
		if ([
			void 0,
			null,
			""
		].includes(getValue()) || isCheckbox(el) && Array.isArray(getValue()) || el.tagName.toLowerCase() === "select" && el.multiple) setValue(getInputValue(el, modifiers, { target: el }, getValue()));
	}
	if (!el._x_removeModelListeners) el._x_removeModelListeners = {};
	el._x_removeModelListeners["default"] = removeListener;
	cleanup(() => el._x_removeModelListeners["default"]());
	if (el.form) {
		let removeResetListener = on(el.form, "reset", [], (e) => {
			nextTick(() => el._x_model && el._x_model.set(getInputValue(el, modifiers, { target: el }, getValue())));
		});
		cleanup(() => removeResetListener());
	}
	el._x_model = {
		get() {
			return getValue();
		},
		set(value) {
			setValue(value);
		},
		setWithModifiers: addDebounceOrThrottle(modifiers, setValue)
	};
	el._x_forceModelUpdate = (value) => {
		if (value === void 0 && typeof expression === "string" && expression.match(/\./)) value = "";
		mutateDom(() => {
			if (isCheckbox(el)) {
				if (Array.isArray(value)) el.checked = value.some((val) => val == el.value);
				else el.checked = !!value;
			} else if (isRadio(el)) {
				if (typeof value === "boolean") el.checked = safeParseBoolean(el.value) === value;
				else el.checked = el.value == value;
			} else bind(el, "value", value);
		});
	};
	if (el.tagName === "SELECT") {
		let observer2 = new MutationObserver(() => {
			el._x_forceModelUpdate(getValue());
		});
		observer2.observe(el, { childList: true });
		cleanup(() => observer2.disconnect());
	}
	effect3(() => {
		let value = getValue();
		if (modifiers.includes("unintrusive") && document.activeElement.isSameNode(el)) return;
		el._x_forceModelUpdate(value);
	});
});
function getInputValue(el, modifiers, event, currentValue) {
	return mutateDom(() => {
		if (event instanceof CustomEvent && event.detail !== void 0) return event.detail !== null && event.detail !== void 0 ? event.detail : event.target.value;
		else if (isCheckbox(el)) {
			if (Array.isArray(currentValue)) {
				let newValue = null;
				if (modifiers.includes("number")) newValue = safeParseNumber(event.target.value);
				else if (modifiers.includes("boolean")) newValue = safeParseBoolean(event.target.value);
				else newValue = event.target.value;
				return event.target.checked ? currentValue.includes(newValue) ? currentValue : currentValue.concat([newValue]) : currentValue.filter((el2) => !checkedAttrLooseCompare2(el2, newValue));
			} else return event.target.checked;
		} else if (el.tagName.toLowerCase() === "select" && el.multiple) {
			if (modifiers.includes("number")) return Array.from(event.target.selectedOptions).map((option) => {
				return safeParseNumber(option.value || option.text);
			});
			else if (modifiers.includes("boolean")) return Array.from(event.target.selectedOptions).map((option) => {
				return safeParseBoolean(option.value || option.text);
			});
			return Array.from(event.target.selectedOptions).map((option) => {
				return option.value || option.text;
			});
		} else {
			let newValue;
			if (isRadio(el)) {
				if (event.target.checked) newValue = event.target.value;
				else newValue = currentValue;
			} else newValue = event.target.value;
			if (modifiers.includes("number")) return safeParseNumber(newValue);
			else if (modifiers.includes("boolean")) return safeParseBoolean(newValue);
			else if (modifiers.includes("trim")) return newValue.trim();
			else return newValue;
		}
	});
}
function safeParseNumber(rawValue) {
	let number = rawValue ? parseFloat(rawValue) : null;
	return isNumeric2(number) ? number : rawValue;
}
function checkedAttrLooseCompare2(valueA, valueB) {
	return valueA == valueB;
}
function isNumeric2(subject) {
	return !Array.isArray(subject) && !isNaN(subject);
}
function isGetterSetter(value) {
	return value !== null && typeof value === "object" && typeof value.get === "function" && typeof value.set === "function";
}
directive("cloak", (el) => queueMicrotask(() => mutateDom(() => el.removeAttribute(prefix("cloak")))));
addInitSelector(() => `[${prefix("init")}]`);
directive("init", skipDuringClone((el, { expression }, { evaluate: evaluate2 }) => {
	if (typeof expression === "string") return !!expression.trim() && evaluate2(expression, {}, false);
	return evaluate2(expression, {}, false);
}));
directive("text", (el, { expression }, { effect: effect3, evaluateLater: evaluateLater2 }) => {
	let evaluate2 = evaluateLater2(expression);
	effect3(() => {
		evaluate2((value) => {
			mutateDom(() => {
				el.textContent = value;
			});
		});
	});
});
directive("html", (el, { expression }, { effect: effect3, evaluateLater: evaluateLater2 }) => {
	let evaluate2 = evaluateLater2(expression);
	effect3(() => {
		evaluate2((value) => {
			mutateDom(() => {
				Array.from(el.children).forEach((child) => destroyTree(child));
				el.innerHTML = value ?? "";
				el._x_ignoreSelf = true;
				initTree(el);
				delete el._x_ignoreSelf;
			});
		});
	}, { priority: "structural" });
});
mapAttributes(startingWith(":", into(prefix("bind:"))));
var handler2 = (el, { value, modifiers, expression, original }, { effect: effect3, cleanup }) => {
	if (!value) {
		let bindingProviders = {};
		injectBindingProviders(bindingProviders);
		evaluateLater(el, expression)((bindings) => {
			applyBindingsObject(el, bindings, original);
		}, { scope: bindingProviders });
		return;
	}
	if (value === "key") return storeKeyForXFor(el, expression);
	if (el._x_inlineBindings && el._x_inlineBindings[value] && el._x_inlineBindings[value].extract) return;
	let evaluate2 = evaluateLater(el, expression);
	effect3(() => evaluate2((result) => {
		if (result === void 0 && typeof expression === "string" && expression.match(/\./)) result = "";
		mutateDom(() => bind(el, value, result, modifiers));
	}));
	cleanup(() => {
		el._x_undoAddedClasses && el._x_undoAddedClasses();
		el._x_undoAddedStyles && el._x_undoAddedStyles();
	});
};
handler2.inline = (el, { value, modifiers, expression }) => {
	if (!value) return;
	if (!el._x_inlineBindings) el._x_inlineBindings = {};
	el._x_inlineBindings[value] = {
		expression,
		extract: false
	};
};
directive("bind", handler2);
function storeKeyForXFor(el, expression) {
	el._x_keyExpression = expression;
}
addRootSelector(() => `[${prefix("data")}]`);
var dataForReconciliation = Symbol();
directive("data", (el, { expression }, { cleanup }) => {
	if (shouldSkipRegisteringDataDuringClone(el)) return;
	let dataToReconcile = el[dataForReconciliation];
	if (dataToReconcile?.expression === expression) return;
	expression = expression === "" ? "{}" : expression;
	let magicContext = {};
	injectMagics(magicContext, el);
	let dataProviderContext = {};
	injectDataProviders(dataProviderContext, magicContext);
	let data2 = evaluate(el, expression, { scope: dataProviderContext });
	if (data2 === void 0 || data2 === true) data2 = {};
	injectMagics(data2, el);
	let reactiveData;
	if (dataToReconcile?.reactiveData) {
		reactiveData = dataToReconcile.reactiveData;
		reconcileData(reactiveData, data2);
		let initialized = { expression };
		el[dataForReconciliation] = initialized;
		queueMicrotask(() => {
			if (el[dataForReconciliation] === initialized) delete el[dataForReconciliation];
		});
	} else reactiveData = reactive(data2);
	initInterceptors(reactiveData, cleanup);
	let undo = addScopeToNode(el, reactiveData);
	reactiveData["init"] && evaluate(el, reactiveData["init"]);
	cleanup(() => {
		reactiveData["destroy"] && evaluate(el, reactiveData["destroy"]);
		undo();
		let removed = { reactiveData };
		el[dataForReconciliation] = removed;
		queueMicrotask(() => {
			if (el[dataForReconciliation] === removed) delete el[dataForReconciliation];
		});
	});
});
function reconcileData(target, source) {
	Object.keys(source).forEach((key) => {
		let descriptor = Object.getOwnPropertyDescriptor(source, key);
		let existingDescriptor = Object.getOwnPropertyDescriptor(target, key);
		if (descriptor.get || descriptor.set || existingDescriptor?.get || existingDescriptor?.set) {
			if (existingDescriptor) delete target[key];
			if (!existingDescriptor) target[key] = void 0;
			descriptor.get || descriptor.set ? Object.defineProperty(target, key, descriptor) : target[key] = source[key];
		} else target[key] = source[key];
	});
	Object.keys(target).filter((key) => !Object.prototype.hasOwnProperty.call(source, key)).forEach((key) => delete target[key]);
}
interceptClone((from, to) => {
	if (from._x_dataStack) {
		to._x_dataStack = from._x_dataStack;
		to.setAttribute("data-has-alpine-state", true);
	}
});
function shouldSkipRegisteringDataDuringClone(el) {
	if (!isCloning) return false;
	if (isCloningLegacy) return true;
	return el.hasAttribute("data-has-alpine-state");
}
directive("show", (el, { modifiers, expression }, { effect: effect3 }) => {
	let evaluate2 = evaluateLater(el, expression);
	if (!el._x_doHide) el._x_doHide = () => {
		mutateDom(() => {
			el.style.setProperty("display", "none", modifiers.includes("important") ? "important" : void 0);
		});
	};
	if (!el._x_doShow) el._x_doShow = () => {
		mutateDom(() => {
			if (el.style.length === 1 && el.style.display === "none") el.removeAttribute("style");
			else el.style.removeProperty("display");
		});
	};
	let hide = () => {
		el._x_doHide();
		el._x_isShown = false;
	};
	let show = () => {
		el._x_doShow();
		el._x_isShown = true;
	};
	let clickAwayCompatibleShow = () => setTimeout(show);
	let toggle = once((value) => value ? show() : hide(), (value) => {
		if (typeof el._x_toggleAndCascadeWithTransitions === "function") el._x_toggleAndCascadeWithTransitions(el, value, show, hide);
		else value ? clickAwayCompatibleShow() : hide();
	});
	let oldValue;
	let firstTime = true;
	effect3(() => evaluate2((value) => {
		if (!firstTime && value === oldValue) return;
		if (modifiers.includes("immediate")) value ? clickAwayCompatibleShow() : hide();
		toggle(value);
		oldValue = value;
		firstTime = false;
	}));
});
directive("for", skipDuringClone((el, { expression }, { effect: effect3, cleanup }) => {
	let iteratorNames = parseForExpression(expression);
	let evaluateItems = evaluateLater(el, iteratorNames.items);
	let evaluateKey = evaluateLater(el, el._x_keyExpression || "index");
	el._x_lookup = /* @__PURE__ */ new Map();
	effect3(() => loop(el, iteratorNames, evaluateItems, evaluateKey), { priority: "structural" });
	cleanup(() => {
		el._x_lookup.forEach((el2) => mutateDom(() => {
			destroyTree(el2);
			el2.remove();
		}));
		delete el._x_lookup;
		delete el._x_lastRenderedEl;
	});
}));
function refreshScope(scope2) {
	return (newScope) => {
		Object.entries(newScope).forEach(([key, value]) => {
			scope2[key] = value;
		});
	};
}
function loop(templateEl, iteratorNames, evaluateItems, evaluateKey) {
	evaluateItems((items) => {
		if (isNumeric3(items)) items = Array.from({ length: items }, (_, i) => i + 1);
		if (items === void 0 || items === null) items = [];
		if (items instanceof Set) items = Array.from(items);
		if (items instanceof Map) items = Array.from(items);
		let oldLookup = templateEl._x_lookup;
		let lookup = /* @__PURE__ */ new Map();
		templateEl._x_lookup = lookup;
		let hasStringKeys = isObject2(items);
		let scopeEntries = Object.entries(items).map(([index, item]) => {
			if (!hasStringKeys) index = parseInt(index);
			let scope2 = getIterationScopeVariables(iteratorNames, item, index, items);
			let key;
			evaluateKey((innerKey) => {
				if (typeof innerKey === "object") warn("x-for key cannot be an object, it must be a string or an integer", templateEl);
				if (oldLookup.has(innerKey)) {
					lookup.set(innerKey, oldLookup.get(innerKey));
					oldLookup.delete(innerKey);
				}
				key = innerKey;
			}, { scope: {
				index,
				...scope2
			} });
			return [key, scope2];
		});
		mutateDom(() => {
			oldLookup.forEach((el) => {
				destroyTree(el);
				el.remove();
			});
			let added = /* @__PURE__ */ new Set();
			let prev = templateEl;
			scopeEntries.forEach(([key, scope2]) => {
				if (lookup.has(key)) {
					let el = lookup.get(key);
					el._x_refreshXForScope(scope2);
					if (prev.nextElementSibling !== el) {
						if (prev.nextElementSibling) el.replaceWith(prev.nextElementSibling);
						prev.after(el);
					}
					prev = el;
					if (el._x_currentIfEl) {
						if (el.nextElementSibling !== el._x_currentIfEl) prev.after(el._x_currentIfEl);
						prev = el._x_currentIfEl;
					}
					return;
				}
				if (templateEl.content.children.length > 1) warn("x-for templates require a single root element, additional elements will be ignored.", templateEl);
				let clone2 = document.importNode(templateEl.content, true).firstElementChild;
				let reactiveScope = reactive(scope2);
				addScopeToNode(clone2, reactiveScope, templateEl);
				clone2._x_refreshXForScope = refreshScope(reactiveScope);
				lookup.set(key, clone2);
				added.add(clone2);
				prev.after(clone2);
				prev = clone2;
			});
			added.forEach((clone2) => initTree(clone2));
			if (prev !== templateEl) templateEl._x_lastRenderedEl = prev;
			else delete templateEl._x_lastRenderedEl;
		});
	});
}
function parseForExpression(expression) {
	let forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
	let stripParensRE = /^\s*\(|\)\s*$/g;
	let inMatch = expression.match(/([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/);
	if (!inMatch) return;
	let res = {};
	res.items = inMatch[2].trim();
	let item = inMatch[1].replace(stripParensRE, "").trim();
	let iteratorMatch = item.match(forIteratorRE);
	if (iteratorMatch) {
		res.item = item.replace(forIteratorRE, "").trim();
		res.index = iteratorMatch[1].trim();
		if (iteratorMatch[2]) res.collection = iteratorMatch[2].trim();
	} else res.item = item;
	return res;
}
function getIterationScopeVariables(iteratorNames, item, index, items) {
	let scopeVariables = {};
	if (/^\[.*\]$/.test(iteratorNames.item) && Array.isArray(item)) iteratorNames.item.replace("[", "").replace("]", "").split(",").map((i) => i.trim()).forEach((name, i) => {
		scopeVariables[name] = item[i];
	});
	else if (/^\{.*\}$/.test(iteratorNames.item) && !Array.isArray(item) && typeof item === "object") iteratorNames.item.replace("{", "").replace("}", "").split(",").map((i) => i.trim()).forEach((name) => {
		scopeVariables[name] = item[name];
	});
	else scopeVariables[iteratorNames.item] = item;
	if (iteratorNames.index) scopeVariables[iteratorNames.index] = index;
	if (iteratorNames.collection) scopeVariables[iteratorNames.collection] = items;
	return scopeVariables;
}
function isNumeric3(subject) {
	return typeof subject !== "object" && !isNaN(subject);
}
function isObject2(subject) {
	return typeof subject === "object" && !Array.isArray(subject);
}
function handler3() {}
handler3.inline = (el, { expression }, { cleanup }) => {
	let root = closestRoot(el);
	if (!root) return;
	if (!root._x_refs) root._x_refs = {};
	root._x_refs[expression] = el;
	cleanup(() => delete root._x_refs[expression]);
};
directive("ref", handler3);
directive("if", skipDuringClone((el, { expression }, { effect: effect3, cleanup }) => {
	if (el.tagName.toLowerCase() !== "template") warn("x-if can only be used on a <template> tag", el);
	let evaluate2 = evaluateLater(el, expression);
	let show = () => {
		if (el._x_currentIfEl) return el._x_currentIfEl;
		let clone2 = el.content.cloneNode(true).firstElementChild;
		addScopeToNode(clone2, {}, el);
		mutateDom(() => {
			el.after(clone2);
			initTree(clone2);
		});
		el._x_currentIfEl = clone2;
		el._x_lastRenderedEl = clone2;
		el._x_undoIf = () => {
			mutateDom(() => {
				destroyTree(clone2);
				clone2.remove();
			});
			delete el._x_currentIfEl;
			delete el._x_lastRenderedEl;
		};
		return clone2;
	};
	let hide = () => {
		if (!el._x_undoIf) return;
		el._x_undoIf();
		delete el._x_undoIf;
	};
	effect3(() => evaluate2((value) => {
		value ? show() : hide();
	}), { priority: "structural" });
	cleanup(() => el._x_undoIf && el._x_undoIf());
}));
directive("id", (el, { expression }, { evaluate: evaluate2 }) => {
	evaluate2(expression).forEach((name) => setIdRoot(el, name));
});
interceptClone((from, to) => {
	if (from._x_ids) to._x_ids = from._x_ids;
});
mapAttributes(startingWith("@", into(prefix("on:"))));
directive("on", skipDuringClone((el, { value, modifiers, expression }, { cleanup }) => {
	let evaluate2 = expression ? evaluateLater(el, expression) : () => {};
	if (el.tagName.toLowerCase() === "template") {
		if (!el._x_forwardEvents) el._x_forwardEvents = [];
		if (!el._x_forwardEvents.includes(value)) el._x_forwardEvents.push(value);
	}
	let removeListener = on(el, value, modifiers, (e) => {
		evaluate2(() => {}, {
			scope: { "$event": e },
			params: [e]
		});
	});
	cleanup(() => removeListener());
}));
warnMissingPluginDirective("Collapse", "collapse", "collapse");
warnMissingPluginDirective("Intersect", "intersect", "intersect");
warnMissingPluginDirective("Focus", "trap", "focus");
warnMissingPluginDirective("Mask", "mask", "mask");
function warnMissingPluginDirective(name, directiveName, slug) {
	directive(directiveName, (el) => warn(`You can't use [x-${directiveName}] without first installing the "${name}" plugin here: https://alpinejs.dev/plugins/${slug}`, el));
}
alpine_default.setEvaluator(normalEvaluator);
alpine_default.setRawEvaluator(normalRawEvaluator);
alpine_default.setReactivityEngine({
	reactive: reactive2,
	effect: (callback, options = {}) => {
		let runner;
		runner = effect2(callback, { scheduler: () => {
			if (!runner) return;
			options.scheduler ? options.scheduler(runner) : runner();
		} });
		return runner;
	},
	release: stop,
	raw: toRaw
});
var module_default = alpine_default;
/*! Bundled license information:

@vue/shared/dist/shared.esm-bundler.js:
(**
* @vue/shared v3.5.41
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**)

@vue/reactivity/dist/reactivity.esm-bundler.js:
(**
* @vue/reactivity v3.5.41
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**)
*/
//#endregion
//#region client/src/dom/TemplateLoader.ts
var TemplateLoader = class {
	cache = /* @__PURE__ */ new Map();
	async load(name) {
		const cached = this.cache.get(name);
		if (cached !== void 0) return cached;
		const response = await fetch(window.IMG_ROOT_PATH + `/game-panels/${name}.html`);
		if (!response.ok) throw new Error(`Failed to load template "${name}": ${response.status} ${response.statusText}`);
		const template = await response.text();
		this.cache.set(name, template);
		return template;
	}
	clear(name) {
		if (name === void 0) this.cache.clear();
		else this.cache.delete(name);
	}
};
//#endregion
//#region client/src/controllers/KeyboardController.ts
var COMBINAISONS = {
	ArrowLeft: "left",
	ArrowRight: "right",
	ArrowUp: "up",
	ArrowDown: "down",
	KeyA: "left",
	KeyD: "right",
	KeyW: "up",
	KeyS: "down",
	Space: "jump",
	Digit0: "0",
	Digit1: "1",
	Digit2: "2",
	Digit3: "3",
	Digit4: "4",
	Digit5: "5",
	Digit6: "6",
	Digit7: "7",
	Digit8: "8",
	Digit9: "9"
};
var KeyboardController = class {
	firstKeys = /* @__PURE__ */ new Set();
	pressedKeys = /* @__PURE__ */ new Set();
	killedKeys = /* @__PURE__ */ new Set();
	init() {
		window.addEventListener("keydown", (event) => {
			const key = COMBINAISONS[event.code];
			if (!key) return;
			if (!this.pressedKeys.has(key)) this.firstKeys.add(key);
			this.pressedKeys.add(key);
			this.killedKeys.delete(key);
		});
		window.addEventListener("keyup", (event) => {
			const key = COMBINAISONS[event.code];
			if (!key) return;
			this.pressedKeys.delete(key);
			this.killedKeys.add(key);
		});
	}
	first(key) {
		return this.firstKeys.has(key);
	}
	press(key) {
		return this.pressedKeys.has(key);
	}
	killed(key) {
		return this.killedKeys.has(key);
	}
	frame() {
		this.firstKeys.clear();
		this.killedKeys.clear();
	}
};
var keyboardController = new KeyboardController();
keyboardController.init();
//#endregion
//#region client/src/controllers/MouseController.ts
var MouseController = class {
	adapter = null;
	playerIdx = 0;
	clientData = null;
	rawX = 0;
	rawY = 0;
	presses = /* @__PURE__ */ new Set();
	firsts = /* @__PURE__ */ new Set();
	kills = /* @__PURE__ */ new Set();
	init() {
		window.addEventListener("mousemove", this.handleMouseMove);
		window.addEventListener("mousedown", this.handleMouseDown);
		window.addEventListener("mouseup", this.handleMouseUp);
	}
	setScreenCoordsAdapter(adapter, playerIdx, clientData) {
		this.adapter = adapter;
		this.playerIdx = playerIdx;
		this.clientData = clientData;
	}
	getCoords() {
		if (this.adapter) {
			const { width: gameWidth, height: gameHeight } = this.adapter.getSize();
			const screenWidth = window.innerWidth;
			const screenHeight = window.innerHeight;
			const scaleX = screenWidth / gameWidth;
			const scaleY = screenHeight / gameHeight;
			const scale = Math.min(scaleX, scaleY);
			const offsetX = (screenWidth - gameWidth * scale) / 2;
			const offsetY = (screenHeight - gameHeight * scale) / 2;
			const gameX = (this.rawX - offsetX) / scale;
			const gameY = (this.rawY - offsetY) / scale;
			return this.adapter.evalMouseCoords(gameX, gameY, this.playerIdx, this.clientData);
		}
		return {
			x: this.rawX,
			y: this.rawY
		};
	}
	first(button) {
		return this.firsts.has(button);
	}
	press(button) {
		return this.presses.has(button);
	}
	killed(button) {
		return this.kills.has(button);
	}
	frame() {
		this.firsts.clear();
		this.kills.clear();
	}
	destroy() {
		window.removeEventListener("mousemove", this.handleMouseMove);
		window.removeEventListener("mousedown", this.handleMouseDown);
		window.removeEventListener("mouseup", this.handleMouseUp);
	}
	handleMouseMove = (e) => {
		this.rawX = e.clientX;
		this.rawY = e.clientY;
	};
	handleMouseDown = (e) => {
		const button = e.button;
		if (!this.presses.has(button)) this.firsts.add(button);
		this.presses.add(button);
	};
	handleMouseUp = (e) => {
		const button = e.button;
		this.presses.delete(button);
		this.kills.add(button);
	};
};
var mouseController = new MouseController();
mouseController.init();
//#endregion
//#region commons/util/mergeSortedArrays.ts
function mergeSortedArrays(a, b, compare) {
	const result = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) if (compare(a[i], b[j]) <= 0) result.push(a[i++]);
	else result.push(b[j++]);
	while (i < a.length) result.push(a[i++]);
	while (j < b.length) result.push(b[j++]);
	return result;
}
//#endregion
//#region commons/util/ImageLoader.ts
var ImageLoader = class {
	loadedCount = 0;
	totalCount = 0;
	placeholder;
	pathRoot;
	baseImages = {};
	coloredImages = {};
	colorRules = {};
	constructor(pathRoot) {
		this.pathRoot = pathRoot;
		const size = 2;
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext("2d");
		ctx.imageSmoothingEnabled = false;
		ctx.fillStyle = "violet";
		ctx.fillRect(0, 0, size / 2, size / 2);
		ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
		ctx.fillStyle = "white";
		ctx.fillRect(size / 2, 0, size / 2, size / 2);
		ctx.fillRect(0, size / 2, size / 2, size / 2);
		this.placeholder = canvas;
	}
	/**
	* Converts a hex color string (#RRGGBB or RRGGBB) to RGB components.
	*/
	hexToRgb(hex) {
		const clean = hex.replace("#", "");
		return [
			parseInt(clean.substring(0, 2), 16),
			parseInt(clean.substring(2, 4), 16),
			parseInt(clean.substring(4, 6), 16)
		];
	}
	/**
	* Replaces colors in an image based on an array of color rules.
	*/
	recolorImage(img, rules) {
		const canvas = document.createElement("canvas");
		canvas.width = img.width;
		canvas.height = img.height;
		const ctx = canvas.getContext("2d");
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(img, 0, 0);
		const parsedRules = rules.map((rule) => ({
			prev: this.hexToRgb(rule.prev),
			next: this.hexToRgb(rule.next)
		}));
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const data = imageData.data;
		for (let i = 0; i < data.length; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			for (const rule of parsedRules) if (r === rule.prev[0] && g === rule.prev[1] && b === rule.prev[2]) {
				data[i] = rule.next[0];
				data[i + 1] = rule.next[1];
				data[i + 2] = rule.next[2];
				break;
			}
		}
		ctx.putImageData(imageData, 0, 0);
		return canvas;
	}
	/**
	* Internal helper to generate and cache a colored version of an image.
	*/
	generateColoredVersion(name, id, folderKey) {
		const img = this.baseImages[folderKey]?.[name];
		const rules = this.colorRules[folderKey]?.[name]?.[id];
		if (!img || !rules) return;
		const canvas = this.recolorImage(img, rules);
		if (!this.coloredImages[folderKey]) this.coloredImages[folderKey] = {};
		if (!this.coloredImages[folderKey][name]) this.coloredImages[folderKey][name] = {};
		this.coloredImages[folderKey][name][id] = canvas;
	}
	/**
	* Registers a coloring rule for a specific texture within a folder. 
	* Applies immediately to already loaded textures, and queues for future ones.
	*/
	setColorRule(name, id, rules, folder = null) {
		const folderKey = folder ?? "root";
		if (!this.colorRules[folderKey]) this.colorRules[folderKey] = {};
		if (!this.colorRules[folderKey][name]) this.colorRules[folderKey][name] = {};
		this.colorRules[folderKey][name][id] = rules;
		if (this.baseImages[folderKey]?.[name]) this.generateColoredVersion(name, id, folderKey);
	}
	/**
	* Loads base images asynchronously into a specific folder and applies any pending color rules.
	*/
	async load(list, folder = null) {
		const folderKey = folder ?? "root";
		this.totalCount += Object.keys(list).length;
		if (!this.baseImages[folderKey]) this.baseImages[folderKey] = {};
		const promises = [];
		for (const [name, path] of Object.entries(list)) {
			const p = (async () => {
				try {
					const res = await fetch(this.pathRoot + path);
					if (!res.ok) throw new Error("Failed to fetch " + path);
					const blob = await res.blob();
					const img = await new Promise((resolve, reject) => {
						const i = new Image();
						i.onload = () => resolve(i);
						i.onerror = (e) => reject(e);
						i.src = URL.createObjectURL(blob);
					});
					this.baseImages[folderKey][name] = img;
					if (this.colorRules[folderKey]?.[name]) for (const idStr of Object.keys(this.colorRules[folderKey][name])) {
						const id = parseInt(idStr, 10);
						this.generateColoredVersion(name, id, folderKey);
					}
					this.loadedCount++;
				} catch (err) {
					console.warn("Error with:", path);
					console.error(err);
					this.loadedCount++;
				}
			})();
			promises.push(p);
		}
		await Promise.all(promises);
	}
	isLoaded() {
		return this.loadedCount === this.totalCount && this.totalCount > 0;
	}
	/**
	* Retrieves an image or canvas texture from a specific folder.
	* @param name - The asset key identifier.
	* @param colorId - The numeric ID of the color rule to apply.
	* @param folder - The folder name to look inside (defaults to 'root').
	*/
	get(name, colorId, folder) {
		if (name === null) return this.placeholder;
		const folderKey = folder ?? "root";
		if (colorId !== void 0) {
			if (this.coloredImages[folderKey]?.[name]?.[colorId]) return this.coloredImages[folderKey][name][colorId];
			return this.placeholder;
		}
		if (this.baseImages[folderKey]?.[name]) return this.baseImages[folderKey][name];
		return this.placeholder;
	}
	/**
	* Returns a scoped object containing a `get` method bound to a specific folder.
	* It acts like an ImageLoader instance but without requiring the folder argument.
	* @param folder - The folder to bind to.
	*/
	getFolder(folder) {
		return {
			get: (name, colorId) => {
				return this.get(name, colorId, folder);
			},
			setColorRule: (name, id, rules) => {
				return this.setColorRule(name, id, rules, folder);
			}
		};
	}
	/**
	* Formats the cached data into a folder structure for external use if needed.
	*/
	getFolders() {
		return {
			default: this.baseImages,
			colored: this.coloredImages
		};
	}
};
//#endregion
//#region client/src/handlers/imageLoader.ts
var imageLoader = new ImageLoader(window.IMG_ROOT_PATH);
//#endregion
//#region client/src/controllers/MobileController.ts
var MobileController = class {
	adapter = null;
	playerIdx = 0;
	clientData = null;
	touches = /* @__PURE__ */ new Map();
	presses = /* @__PURE__ */ new Set();
	firsts = /* @__PURE__ */ new Set();
	kills = /* @__PURE__ */ new Set();
	joystickValues = /* @__PURE__ */ new Map();
	hiddenButtons = /* @__PURE__ */ new Set();
	init() {
		window.addEventListener("touchstart", this.handleTouchStart, { passive: false });
		window.addEventListener("touchmove", this.handleTouchMove, { passive: false });
		window.addEventListener("touchend", this.handleTouchEnd, { passive: false });
		window.addEventListener("touchcancel", this.handleTouchEnd, { passive: false });
	}
	setScreenCoordsAdapter(adapter, playerIdx, clientData) {
		this.adapter = adapter;
		this.playerIdx = playerIdx;
		this.clientData = clientData;
	}
	resolveJoyPosition(el, screenWidth, screenHeight) {
		let centerX = 0;
		if (el.xp === "right") centerX = screenWidth - el.x;
		else if (el.xp === "ratio") centerX = el.x * screenWidth;
		else centerX = el.x;
		let centerY = 0;
		if (el.yp === "bottom") centerY = screenHeight - el.y;
		else if (el.yp === "ratio") centerY = el.y * screenHeight;
		else centerY = el.y;
		return {
			centerX,
			centerY,
			radius: el.size / 2
		};
	}
	resolveBtnPosition(el, screenWidth, screenHeight) {
		let centerX = 0;
		if (el.xp === "right") centerX = screenWidth - el.x;
		else if (el.xp === "ratio") centerX = el.x * screenWidth;
		else centerX = el.x;
		let centerY = 0;
		if (el.yp === "bottom") centerY = screenHeight - el.y;
		else if (el.yp === "ratio") centerY = el.y * screenHeight;
		else centerY = el.y;
		return {
			centerX,
			centerY,
			size: el.size
		};
	}
	getGameCoords(screenX, screenY) {
		if (!this.adapter) return {
			x: screenX,
			y: screenY
		};
		const { width: gameWidth, height: gameHeight } = this.adapter.getSize();
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;
		const scaleX = screenWidth / gameWidth;
		const scaleY = screenHeight / gameHeight;
		const scale = Math.min(scaleX, scaleY);
		const offsetX = (screenWidth - gameWidth * scale) / 2;
		const offsetY = (screenHeight - gameHeight * scale) / 2;
		const gameX = (screenX - offsetX) / scale;
		const gameY = (screenY - offsetY) / scale;
		return this.adapter.evalMouseCoords(gameX, gameY, this.playerIdx, this.clientData);
	}
	identifyTouchTarget(touchId, screenX, screenY) {
		if (!this.adapter) return touchId;
		const mobileData = this.adapter.getMobileDesc();
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;
		if (mobileData && mobileData.buttons) for (const [key, btn] of Object.entries(mobileData.buttons)) {
			if (this.hiddenButtons.has(key)) continue;
			const { centerX, centerY, size } = this.resolveBtnPosition(btn, screenWidth, screenHeight);
			const halfSize = size / 2;
			if (screenX >= centerX - halfSize && screenX <= centerX + halfSize && screenY >= centerY - halfSize && screenY <= centerY + halfSize) return key;
		}
		if (mobileData && mobileData.joysticks) for (const [key, joy] of Object.entries(mobileData.joysticks)) {
			if (this.hiddenButtons.has(key)) continue;
			const { centerX, centerY, radius } = this.resolveJoyPosition(joy, screenWidth, screenHeight);
			const dx = screenX - centerX;
			const dy = screenY - centerY;
			if (dx * dx + dy * dy <= radius * radius) return key;
		}
		return touchId;
	}
	updateJoystickValues() {
		if (!this.adapter) return;
		const mobileData = this.adapter.getMobileDesc();
		if (!mobileData || !mobileData.joysticks) return;
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;
		for (const key of Object.keys(mobileData.joysticks)) this.joystickValues.set(key, {
			x: 0,
			y: 0
		});
		for (const touch of this.touches.values()) if (typeof touch.target === "string" && mobileData.joysticks[touch.target]) {
			const joyKey = touch.target;
			const joy = mobileData.joysticks[joyKey];
			const { centerX, centerY, radius: maxRadius } = this.resolveJoyPosition(joy, screenWidth, screenHeight);
			const dx = touch.screenX - centerX;
			const dy = touch.screenY - centerY;
			const distance = Math.sqrt(dx * dx + dy * dy);
			if (distance === 0) this.joystickValues.set(joyKey, {
				x: 0,
				y: 0
			});
			else {
				const clampDist = Math.min(distance, maxRadius);
				const normX = dx / distance * (clampDist / maxRadius);
				const normY = dy / distance * (clampDist / maxRadius);
				this.joystickValues.set(joyKey, {
					x: normX,
					y: normY
				});
			}
		}
	}
	getJoystick(name) {
		return this.joystickValues.get(name) || {
			x: 0,
			y: 0
		};
	}
	draw(ctx) {
		if (!this.adapter) return;
		const mobileData = this.adapter.getMobileDesc();
		if (!mobileData) return;
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;
		ctx.save();
		if (mobileData.joysticks) for (const [key, joy] of Object.entries(mobileData.joysticks)) {
			if (this.hiddenButtons.has(key)) continue;
			const { centerX, centerY, radius } = this.resolveJoyPosition(joy, screenWidth, screenHeight);
			const values = this.getJoystick(key);
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
			ctx.fillStyle = joy.color + "33";
			ctx.fill();
			ctx.lineWidth = 3;
			ctx.strokeStyle = joy.color;
			ctx.stroke();
			const knobX = centerX + values.x * radius;
			const knobY = centerY + values.y * radius;
			const knobRadius = radius * .4;
			ctx.beginPath();
			ctx.arc(knobX, knobY, knobRadius, 0, Math.PI * 2);
			ctx.fillStyle = joy.color;
			ctx.fill();
		}
		if (mobileData.buttons) for (const [key, btn] of Object.entries(mobileData.buttons)) {
			if (this.hiddenButtons.has(key)) continue;
			const { centerX, centerY, size } = this.resolveBtnPosition(btn, screenWidth, screenHeight);
			const isPressed = this.press(key);
			const halfSize = size / 2;
			const radius = size * .2;
			ctx.beginPath();
			ctx.roundRect(centerX - halfSize, centerY - halfSize, size, size, radius);
			ctx.fillStyle = isPressed ? btn.color : btn.color + "66";
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = "#FFFFFF";
			ctx.stroke();
			ctx.fillStyle = "#FFFFFF";
			ctx.font = `bold ${Math.round(size * .3)}px sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(key.toUpperCase(), centerX, centerY);
		}
		ctx.restore();
	}
	getDigits() {
		return Array.from(this.touches.values()).filter((touch) => typeof touch.target === "number").map((touch) => ({
			x: touch.gameX,
			y: touch.gameY,
			id: touch.target
		}));
	}
	first(button) {
		return this.firsts.has(button);
	}
	press(button) {
		return this.presses.has(button);
	}
	killed(button) {
		return this.kills.has(button);
	}
	showButton(button) {
		this.hiddenButtons.delete(button);
	}
	hideButton(button) {
		this.hiddenButtons.add(button);
	}
	frame() {
		this.firsts.clear();
		this.kills.clear();
	}
	destroy() {
		window.removeEventListener("touchstart", this.handleTouchStart);
		window.removeEventListener("touchmove", this.handleTouchMove);
		window.removeEventListener("touchend", this.handleTouchEnd);
		window.removeEventListener("touchcancel", this.handleTouchEnd);
	}
	handleTouchStart = (e) => {
		e.preventDefault();
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch = e.changedTouches[i];
			const screenX = touch.clientX;
			const screenY = touch.clientY;
			const coords = this.getGameCoords(screenX, screenY);
			const target = this.identifyTouchTarget(touch.identifier, screenX, screenY);
			this.touches.set(touch.identifier, {
				screenX,
				screenY,
				gameX: coords.x,
				gameY: coords.y,
				target
			});
			if (!this.presses.has(target)) this.firsts.add(target);
			this.presses.add(target);
		}
		this.updateJoystickValues();
	};
	handleTouchMove = (e) => {
		e.preventDefault();
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch = e.changedTouches[i];
			const existing = this.touches.get(touch.identifier);
			if (existing) {
				const screenX = touch.clientX;
				const screenY = touch.clientY;
				const coords = this.getGameCoords(screenX, screenY);
				existing.screenX = screenX;
				existing.screenY = screenY;
				existing.gameX = coords.x;
				existing.gameY = coords.y;
			}
		}
		this.updateJoystickValues();
	};
	handleTouchEnd = (e) => {
		e.preventDefault();
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch = e.changedTouches[i];
			const existing = this.touches.get(touch.identifier);
			if (existing) {
				const target = existing.target;
				this.presses.delete(target);
				this.kills.add(target);
				this.touches.delete(touch.identifier);
			}
		}
		this.updateJoystickValues();
	};
};
var mobileController = new MobileController();
mobileController.init();
//#endregion
//#region client/src/dom/clientNavigatorType.ts
function hasNavigatorMobile() {
	return navigator.maxTouchPoints > 0;
}
function hasNavigatorMouse() {
	return window.matchMedia("(any-pointer: fine)").matches;
}
//#endregion
//#region client/src/handlers/FullScreenHandler.ts
var FullScreenHandler = class {
	ownsFullscreen = false;
	constructor() {
		document.addEventListener("fullscreenchange", () => {
			if (!document.fullscreenElement) this.ownsFullscreen = false;
		});
	}
	async openFull() {
		if (document.fullscreenElement) {
			this.ownsFullscreen = false;
			return;
		}
		await document.documentElement.requestFullscreen();
		this.ownsFullscreen = true;
	}
	async closeFull() {
		if (!this.ownsFullscreen) return;
		if (!document.fullscreenElement) {
			this.ownsFullscreen = false;
			return;
		}
		await document.exitFullscreen();
		this.ownsFullscreen = false;
	}
};
var fullScreenHandler = new FullScreenHandler();
console.log(fullScreenHandler);
//#endregion
//#region client/src/handlers/GameHandler.ts
var canvas = document.getElementById("play-canvas");
var ctx$2 = canvas.getContext("2d");
canvas.oncontextmenu = (e) => {
	e.preventDefault();
};
function resizeCanvas() {
	const dpr = window.devicePixelRatio || 1;
	const width = window.innerWidth;
	const height = window.innerHeight;
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
	canvas.width = Math.round(width * dpr);
	canvas.height = Math.round(height * dpr);
	canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
function compareInputs(a, b) {
	return a.timestamp - b.timestamp;
}
var GameHandler = class {
	gamemodeId;
	gamemode;
	playerIdx;
	protocols;
	clientData;
	lastEmulation = 0;
	userInputs = [];
	gameWidth;
	gameHeight;
	prevDraw = null;
	allowsMobile;
	constructor(gamemodeId, gamemode, playerIdx, protocols, clientData) {
		this.gamemodeId = gamemodeId;
		this.gamemode = gamemode;
		this.playerIdx = playerIdx;
		this.protocols = protocols;
		this.clientData = clientData;
		const gsize = this.gamemode.getSize();
		this.gameWidth = gsize.width;
		this.gameHeight = gsize.height;
		mouseController.setScreenCoordsAdapter(this.gamemode, playerIdx, clientData);
		if (this.gamemode.getMobileDesc() && hasNavigatorMobile()) {
			this.allowsMobile = true;
			mobileController.setScreenCoordsAdapter(gamemode, playerIdx, clientData);
		} else this.allowsMobile = false;
	}
	receive(gdata) {
		const msg = decodeFullMessage(this.protocols.ServerMessage.decode(gdata));
		this.gamemode.load(msg.state);
		const now = getNow();
		this.lastEmulation = now;
		const inputs = mergeSortedArrays(msg.inputs.map((i) => ({
			...i.data,
			player: i.player
		})), this.userInputs.map((i) => ({
			...i,
			player: this.playerIdx
		})), compareInputs);
		this.gamemode.emulate(msg.timestamp, now, inputs);
		const output = this.protocols.ClientMessage.encode({
			timestamp: now,
			inputs: this.userInputs
		}).finish();
		this.userInputs.length = 0;
		return output;
	}
	draw(dt) {
		const scaleX = innerWidth / this.gameWidth;
		const scaleY = innerHeight / this.gameHeight;
		const scale = Math.min(scaleX, scaleY);
		const offsetX = (innerWidth - this.gameWidth * scale) / 2;
		const offsetY = (innerHeight - this.gameHeight * scale) / 2;
		ctx$2.save();
		ctx$2.clearRect(0, 0, innerWidth, innerHeight);
		ctx$2.translate(offsetX, offsetY);
		ctx$2.scale(scale, scale);
		this.gamemode.draw(ctx$2, this.playerIdx, this.clientData, imageLoader, dt);
		ctx$2.restore();
		ctx$2.fillStyle = "black";
		if (offsetX > 0) {
			ctx$2.fillRect(0, 0, offsetX, innerHeight);
			ctx$2.fillRect(innerWidth - offsetX, 0, offsetX, innerHeight);
		}
		if (offsetY > 0) {
			ctx$2.fillRect(0, 0, innerWidth, offsetY);
			ctx$2.fillRect(0, innerHeight - offsetY, innerWidth, offsetY);
		}
		if (this.allowsMobile) mobileController.draw(ctx$2);
	}
	frame() {
		const now = getNow();
		const newInputs = this.gamemode.collectInputs(keyboardController, mouseController, this.allowsMobile && !hasNavigatorMouse() ? mobileController : null, this.clientData).map((data) => ({
			...data,
			timestamp: now
		}));
		this.userInputs.push(...newInputs);
		keyboardController.frame();
		mouseController.frame();
		mobileController.frame();
		this.gamemode.emulate(this.lastEmulation, now, newInputs.map((i) => ({
			...i,
			player: this.playerIdx
		})));
		this.lastEmulation = now;
		this.draw(this.prevDraw === null ? 1 / 60 : now - this.prevDraw);
		this.prevDraw = now;
		if (_gameHandler) requestAnimationFrame(() => this.frame());
	}
};
var _gameHandler = null;
function getGameHandler() {
	return _gameHandler;
}
async function setGameHandler(gamemode, playerIdx, startData, total) {
	const factory = getMultiGmFactory(gamemode);
	const protocols = getProtocol(gamemode, "multiplayer");
	await protocols.load();
	const { game, data, html, skins } = factory.client(startData, total, playerIdx);
	await imageLoader.load(skins, gamemode);
	const gameHtml = document.getElementById("game-html");
	gameHtml.innerHTML = "";
	if (html) gameHtml.appendChild(html);
	await fullScreenHandler.openFull();
	_gameHandler = new GameHandler(gamemode, game, playerIdx, protocols.get(), data);
	_gameHandler.frame();
	dom.openPlay();
	return _gameHandler;
}
function deleteGameHandler() {
	fullScreenHandler.closeFull();
	_gameHandler = null;
}
//#endregion
//#region client/src/handlers/WaitingPlayHandler.ts
var WaitingPlayHandler = class {
	total;
	gamemode;
	userIdentifier;
	update;
	users = {};
	constructor(total, gamemode, userIdentifier, update, users) {
		this.total = total;
		this.gamemode = gamemode;
		this.userIdentifier = userIdentifier;
		this.update = update;
		const protocol = getProtocol(gamemode);
		protocol.load().then(() => {
			const { StartData } = protocol.get();
			for (const user of users) {
				this.users[user.identifier] = {
					pseudo: user.pseudo,
					allowBots: user.allowBots,
					isBot: user.isBot,
					data: decodeFullMessage(StartData.decode(user.data))
				};
				update(this.users, {
					type: "add",
					identifier: user.identifier
				});
			}
		});
	}
	add(user) {
		const protocol = getProtocol(this.gamemode);
		protocol.load().then(() => {
			const { StartData } = protocol.get();
			this.users[user.identifier] = {
				pseudo: user.pseudo,
				allowBots: user.allowBots,
				isBot: user.isBot,
				data: decodeFullMessage(StartData.decode(user.data))
			};
			this.update(this.users, {
				type: "add",
				identifier: user.identifier
			});
		});
	}
	remove(identifier) {
		this.update(this.users, {
			type: "remove",
			identifier
		});
		delete this.users[identifier];
	}
	updateBotAllow(identifier, allow) {
		const user = this.users[identifier];
		if (user) {
			user.allowBots = allow;
			this.update(this.users, {
				type: "updateBotAllow",
				identifier,
				allow
			});
		}
	}
};
var waitingPlayHandler = null;
function getWaitingPlayHandler() {
	return waitingPlayHandler;
}
function setWaitingPlayHandler(total, gamemode, userIdentifier, users) {
	getMultiGmFactory(gamemode);
	const updateDom = function(users, event) {
		const waitPlayPanel = dom.getWaitPlayPanel();
		switch (event.type) {
			case "add":
				waitPlayPanel.add(users[event.identifier], event.identifier);
				break;
			case "remove":
				waitPlayPanel.remove(event.identifier);
				break;
			case "updateBotAllow": waitPlayPanel.updateBotAllow(users[event.identifier], event.identifier, event.allow);
		}
	};
	waitingPlayHandler = new WaitingPlayHandler(total, gamemode, userIdentifier, updateDom, users);
	dom.getWaitPlayPanel().initComponent(userIdentifier);
	return waitingPlayHandler;
}
function deleteWaitingPlayHandler() {
	waitingPlayHandler = null;
}
//#endregion
//#region commons/util/flattenArrays.ts
function unflattenPositiveArrays(values, forbidden = -2147483648) {
	const result = [[]];
	for (const value of values) if (value === forbidden) result.push([]);
	else result[result.length - 1].push(value);
	return result;
}
//#endregion
//#region client/src/messages/recvMessage.ts
var runners = {
	gdata(gdata) {
		const ghandler = getGameHandler();
		if (ghandler) sendMessage({ gdata: ghandler.receive(gdata) });
		else console.warn("Received gdata while ghandler is null");
	},
	async startGame(d) {
		const gdata = (await setGameHandler(d.gamemode, d.playerIdx, d.startData, d.total)).receive(d.gdata);
		console.log("playerIdx", d.playerIdx);
		sendMessage({ gdata });
	},
	/**
	* Handle account creation response from the server.
	*/
	createAccountResult(d) {
		console.log("createAccountResult success:", d.success);
		if (d.success) {
			if (d.key) localStorage.setItem("ayke_connectionKey", d.key);
			dom.isAuthenticated = true;
			dom.pseudo = d.pseudo;
			dom.openHome();
		} else dom.getSigninPanel().errorMessage = "Account creation failed. Username may already be taken.";
	},
	/**
	* Handle login response from the server.
	*/
	loginResult(d) {
		console.log("loginResult success:", d.success);
		if (d.success) {
			if (d.key) localStorage.setItem("ayke_connectionKey", d.key);
			dom.isAuthenticated = true;
			dom.pseudo = d.pseudo;
			dom.openHome();
		} else dom.getLoginPanel().errorMessage = "Invalid username or password";
	},
	error(d) {
		console.error(d.code, d.message);
	},
	waitingWelcome(d) {
		setWaitingPlayHandler(d.total, d.gamemode, d.identifier, d.users);
	},
	waitingAddUser(d) {
		const w = getWaitingPlayHandler();
		if (w) w.add(d.user);
	},
	waitingRemoveUser(d) {
		const w = getWaitingPlayHandler();
		if (w) w.remove(d.identifier);
	},
	waitingAllowBots(d) {
		const w = getWaitingPlayHandler();
		if (w) w.updateBotAllow(d.identifier, d.allow);
	},
	finishGame(d) {
		d = decodeFullMessage(d);
		d.results = unflattenPositiveArrays(d.results, -2);
		dom.openPlayResults(d);
	},
	/**
	* Handles the paginated leaderboard results sent by the server.
	*/
	leaderboardResult(d) {
		if (dom.uses("leaderboard")) {
			const panel = dom.getLeaderboardPanel();
			panel.entries = d.entries || [];
		}
	},
	soloRecords(d) {
		if (dom.uses("solo-leaderboard")) {
			const panel = dom.getSoloLeaderboardPanel();
			console.log(d);
			panel.setSoloRecords(d);
		}
	},
	skinsResponse(d) {
		console.log(d);
		if (skinsResponseResolve) {
			skinsResponseResolve(d.skins);
			skinsResponseResolve = null;
		}
	}
};
var skinsResponseResolve = null;
function waitSkinsResponsePromise() {
	return new Promise((resolve) => {
		skinsResponseResolve = resolve;
	});
}
function recvMessage(msg) {
	runners[msg.message](msg[msg.message]);
}
//#endregion
//#region client/src/messages/sendMessage.ts
var _deltaTime = 0;
var _deltaSendDate = 0;
function calculateDeltaTime(servDate) {
	const clientReceive = performance.now();
	const serverTime = Number(servDate);
	const rtt = clientReceive - _deltaSendDate;
	_deltaTime = serverTime - (_deltaSendDate + rtt / 2);
	console.log("Delta time:", _deltaTime.toFixed(4));
}
var msgtypes = (async function() {
	const root = await (async function() {
		const protoText = await (await fetch(window.PROTOCOL_FILE)).text();
		return import_protobufjs.parse(protoText).root;
	})();
	const ClientMessage = root.lookupType("game.ClientMessage");
	const ServerMessage = root.lookupType("game.ServerMessage");
	const socket = new WebSocket(window.SERVER_ADDRESS);
	await new Promise((resolve, reject) => {
		socket.addEventListener("open", () => {
			resolve();
		});
		socket.addEventListener("message", async (event) => {
			try {
				const buffer = new Uint8Array(await event.data.arrayBuffer());
				const msg = ServerMessage.decode(buffer);
				if (msg.message === "timeDeltaDate") calculateDeltaTime(msg.timeDeltaDate);
				else recvMessage(msg);
			} catch (error) {
				console.error("Failed to decode the incoming WebSocket message:", error);
			}
		});
		socket.addEventListener("error", () => {
			reject(/* @__PURE__ */ new Error("WebSocket connection failed"));
		});
	});
	console.log("WebSocket connected!");
	function send(message) {
		const data = ClientMessage.encode(message).finish();
		const buffer = new ArrayBuffer(data.byteLength);
		new Uint8Array(buffer).set(data);
		socket.send(buffer);
	}
	{
		const data = ClientMessage.encode({ askTimeDelta: {} }).finish();
		const buffer = new ArrayBuffer(data.byteLength);
		new Uint8Array(buffer).set(data);
		_deltaSendDate = performance.now();
		socket.send(buffer);
	}
	return {
		send,
		ClientMessage,
		ServerMessage
	};
})();
function sendMessage(message) {
	msgtypes.then((m) => m.send(message));
}
function getNow() {
	return performance.now() + _deltaTime;
}
//#endregion
//#region commons/util/escapeHTML.ts
function escapeHTML(str) {
	return str.replace(/[&<>"']/g, (char) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[char]);
}
//#endregion
//#region client/src/handlers/LocalGameHandler.ts
var ctx$1 = document.getElementById("play-canvas").getContext("2d");
var LocalGameHandler = class {
	clock = 0;
	lastTime = 0;
	gamemode;
	interrupted = false;
	tutorial;
	clientData;
	gameWidth;
	gameHeight;
	allowsMobile;
	imageLoaderPromise;
	constructor(gamemodeId) {
		const { game, data, html, skins } = getMultiGmFactory(gamemodeId).client(null, 2, 0);
		const gameHtml = document.getElementById("game-html");
		gameHtml.innerHTML = "";
		if (html) gameHtml.appendChild(html);
		this.gamemode = game;
		this.tutorial = this.gamemode.createTutorial();
		this.clientData = data;
		const gsize = this.gamemode.getSize();
		this.gameWidth = gsize.width;
		this.gameHeight = gsize.height;
		mouseController.setScreenCoordsAdapter(this.gamemode, 0, data);
		if (this.gamemode.getMobileDesc() && hasNavigatorMobile()) {
			this.allowsMobile = true;
			mobileController.setScreenCoordsAdapter(this.gamemode, 0, data);
		} else this.allowsMobile = false;
		this.imageLoaderPromise = imageLoader.load(skins, gamemodeId);
	}
	async start() {
		await fullScreenHandler.openFull();
		await this.imageLoaderPromise;
		this.clock = 0;
		this.lastTime = performance.now();
		requestAnimationFrame(() => this.frame());
	}
	draw(dt) {
		const scaleX = innerWidth / this.gameWidth;
		const scaleY = innerHeight / this.gameHeight;
		const scale = Math.min(scaleX, scaleY);
		const offsetX = (innerWidth - this.gameWidth * scale) / 2;
		const offsetY = (innerHeight - this.gameHeight * scale) / 2;
		ctx$1.save();
		ctx$1.clearRect(0, 0, innerWidth, innerHeight);
		ctx$1.translate(offsetX, offsetY);
		ctx$1.scale(scale, scale);
		this.gamemode.draw(ctx$1, 0, this.clientData, imageLoader, dt);
		ctx$1.restore();
		ctx$1.fillStyle = "black";
		if (offsetX > 0) {
			ctx$1.fillRect(0, 0, offsetX, innerHeight);
			ctx$1.fillRect(innerWidth - offsetX, 0, offsetX, innerHeight);
		}
		if (offsetY > 0) {
			ctx$1.fillRect(0, 0, innerWidth, offsetY);
			ctx$1.fillRect(0, innerHeight - offsetY, innerWidth, offsetY);
		}
		if (this.allowsMobile) mobileController.draw(ctx$1);
	}
	frame() {
		if (this.interrupted) return;
		const now = performance.now();
		const dt = (now - this.lastTime) / 1e3;
		this.lastTime = now;
		this.clock += dt;
		const inputs = this.gamemode.collectInputs(keyboardController, mouseController, this.allowsMobile && !hasNavigatorMouse() ? mobileController : null, this.clientData);
		keyboardController.frame();
		mouseController.frame();
		mobileController.frame();
		for (const input of inputs) this.gamemode.runInput(0, input);
		const tutorialResult = this.tutorial.frame(dt, this.clock);
		if (tutorialResult === null) {
			this.interrupted = true;
			dom.openHome();
			return;
		} else dom.getTutorialInplayComponent().setText(tutorialResult);
		if (this.gamemode.quickEmulate(dt, true)) {
			this.interrupted = true;
			deleteGameHandler();
			dom.openHome();
			return;
		}
		this.draw(dt);
		requestAnimationFrame(() => this.frame());
	}
};
//#endregion
//#region node_modules/prando/dist/Prando.es.js
var Prando = function() {
	/**
	* Generate a new Prando pseudo-random number generator.
	*
	* @param seed - A number or string seed that determines which pseudo-random number sequence will be created. Defaults to a random seed based on `Math.random()`.
	*/
	function Prando(seed) {
		this._value = NaN;
		if (typeof seed === "string") this._seed = this.hashCode(seed);
		else if (typeof seed === "number") this._seed = this.getSafeSeed(seed);
		else this._seed = this.getSafeSeed(Prando.MIN + Math.floor((Prando.MAX - Prando.MIN) * Math.random()));
		this.reset();
	}
	/**
	* Generates a pseudo-random number between a lower (inclusive) and a higher (exclusive) bounds.
	*
	* @param min - The minimum number that can be randomly generated.
	* @param pseudoMax - The maximum number that can be randomly generated (exclusive).
	* @return The generated pseudo-random number.
	*/
	Prando.prototype.next = function(min, pseudoMax) {
		if (min === void 0) min = 0;
		if (pseudoMax === void 0) pseudoMax = 1;
		this.recalculate();
		return this.map(this._value, Prando.MIN, Prando.MAX, min, pseudoMax);
	};
	/**
	* Generates a pseudo-random integer number in a range (inclusive).
	*
	* @param min - The minimum number that can be randomly generated.
	* @param max - The maximum number that can be randomly generated.
	* @return The generated pseudo-random number.
	*/
	Prando.prototype.nextInt = function(min, max) {
		if (min === void 0) min = 10;
		if (max === void 0) max = 100;
		this.recalculate();
		return Math.floor(this.map(this._value, Prando.MIN, Prando.MAX, min, max + 1));
	};
	/**
	* Generates a pseudo-random string sequence of a particular length from a specific character range.
	*
	* Note: keep in mind that creating a random string sequence does not guarantee uniqueness; there is always a
	* 1 in (char_length^string_length) chance of collision. For real unique string ids, always check for
	* pre-existing ids, or employ a robust GUID/UUID generator.
	*
	* @param length - Length of the string to be generated.
	* @param chars - Characters that are used when creating the random string. Defaults to all alphanumeric chars (A-Z, a-z, 0-9).
	* @return The generated string sequence.
	*/
	Prando.prototype.nextString = function(length, chars) {
		if (length === void 0) length = 16;
		if (chars === void 0) chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		var str = "";
		while (str.length < length) str += this.nextChar(chars);
		return str;
	};
	/**
	* Generates a pseudo-random string of 1 character specific character range.
	*
	* @param chars - Characters that are used when creating the random string. Defaults to all alphanumeric chars (A-Z, a-z, 0-9).
	* @return The generated character.
	*/
	Prando.prototype.nextChar = function(chars) {
		if (chars === void 0) chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		return chars.substr(this.nextInt(0, chars.length - 1), 1);
	};
	/**
	* Picks a pseudo-random item from an array. The array is left unmodified.
	*
	* Note: keep in mind that while the returned item will be random enough, picking one item from the array at a time
	* does not guarantee nor imply that a sequence of random non-repeating items will be picked. If you want to
	* *pick items in a random order* from an array, instead of *pick one random item from an array*, it's best to
	* apply a *shuffle* transformation to the array instead, then read it linearly.
	*
	* @param array - Array of any type containing one or more candidates for random picking.
	* @return An item from the array.
	*/
	Prando.prototype.nextArrayItem = function(array) {
		return array[this.nextInt(0, array.length - 1)];
	};
	/**
	* Generates a pseudo-random boolean.
	*
	* @return A value of true or false.
	*/
	Prando.prototype.nextBoolean = function() {
		this.recalculate();
		return this._value > .5;
	};
	/**
	* Skips ahead in the sequence of numbers that are being generated. This is equivalent to
	* calling next() a specified number of times, but faster since it doesn't need to map the
	* new random numbers to a range and return it.
	*
	* @param iterations - The number of items to skip ahead.
	*/
	Prando.prototype.skip = function(iterations) {
		if (iterations === void 0) iterations = 1;
		while (iterations-- > 0) this.recalculate();
	};
	/**
	* Reset the pseudo-random number sequence back to its starting seed. Further calls to next()
	* will then produce the same sequence of numbers it had produced before. This is equivalent to
	* creating a new Prando instance with the same seed as another Prando instance.
	*
	* Example:
	* let rng = new Prando(12345678);
	* console.log(rng.next()); // 0.6177754114889017
	* console.log(rng.next()); // 0.5784605181725837
	* rng.reset();
	* console.log(rng.next()); // 0.6177754114889017 again
	* console.log(rng.next()); // 0.5784605181725837 again
	*/
	Prando.prototype.reset = function() {
		this._value = this._seed;
	};
	Prando.prototype.recalculate = function() {
		this._value = this.xorshift(this._value);
	};
	Prando.prototype.xorshift = function(value) {
		value ^= value << 13;
		value ^= value >> 17;
		value ^= value << 5;
		return value;
	};
	Prando.prototype.map = function(val, minFrom, maxFrom, minTo, maxTo) {
		return (val - minFrom) / (maxFrom - minFrom) * (maxTo - minTo) + minTo;
	};
	Prando.prototype.hashCode = function(str) {
		var hash = 0;
		if (str) {
			var l = str.length;
			for (var i = 0; i < l; i++) {
				hash = (hash << 5) - hash + str.charCodeAt(i);
				hash |= 0;
				hash = this.xorshift(hash);
			}
		}
		return this.getSafeSeed(hash);
	};
	Prando.prototype.getSafeSeed = function(seed) {
		if (seed === 0) return 1;
		return seed;
	};
	Prando.MIN = -2147483648;
	Prando.MAX = 2147483647;
	return Prando;
}();
//#endregion
//#region client/src/handlers/SoloGameHandler.ts
var ctx = document.getElementById("play-canvas").getContext("2d");
var SoloGameHandler = class {
	gamemodeId;
	gamemode;
	category;
	clock = 0;
	lastTime = 0;
	interrupted = false;
	gameWidth;
	gameHeight;
	allowsMobile;
	inputs = [];
	Input;
	clientData;
	seed;
	constructor(gamemodeId, gamemode, category) {
		this.gamemodeId = gamemodeId;
		this.gamemode = gamemode;
		this.category = category;
		const gsize = this.gamemode.getSize();
		this.gameWidth = gsize.width;
		this.gameHeight = gsize.height;
		this.seed = Math.floor(Math.random() * 2e9);
		this.clientData = this.gamemode.init(category, new Prando(this.seed), true);
		mouseController.setScreenCoordsAdapter(this.gamemode, 0, this.clientData);
		if (this.gamemode.getMobileDesc() && hasNavigatorMobile()) {
			this.allowsMobile = true;
			mobileController.setScreenCoordsAdapter(this.gamemode, 0, this.clientData);
		} else this.allowsMobile = false;
	}
	async start() {
		await fullScreenHandler.openFull();
		this.clock = 0;
		this.lastTime = performance.now();
		const protocols = getProtocol(this.gamemodeId, "solo");
		await protocols.load();
		this.Input = protocols.get().Input;
		requestAnimationFrame(() => this.frame());
	}
	draw(dt) {
		const scaleX = innerWidth / this.gameWidth;
		const scaleY = innerHeight / this.gameHeight;
		const scale = Math.min(scaleX, scaleY);
		const offsetX = (innerWidth - this.gameWidth * scale) / 2;
		const offsetY = (innerHeight - this.gameHeight * scale) / 2;
		ctx.save();
		ctx.clearRect(0, 0, innerWidth, innerHeight);
		ctx.translate(offsetX, offsetY);
		ctx.scale(scale, scale);
		this.gamemode.draw(ctx, this.clientData, imageLoader, dt);
		ctx.restore();
		ctx.fillStyle = "black";
		if (offsetX > 0) {
			ctx.fillRect(0, 0, offsetX, innerHeight);
			ctx.fillRect(innerWidth - offsetX, 0, offsetX, innerHeight);
		}
		if (offsetY > 0) {
			ctx.fillRect(0, 0, innerWidth, offsetY);
			ctx.fillRect(0, innerHeight - offsetY, innerWidth, offsetY);
		}
		if (this.allowsMobile) mobileController.draw(ctx);
	}
	frame() {
		if (this.interrupted) return;
		const now = performance.now();
		const dt = (now - this.lastTime) / 1e3;
		this.lastTime = now;
		const inputs = this.gamemode.collectInputs(keyboardController, mouseController, this.allowsMobile && !hasNavigatorMouse() ? mobileController : null, this.clientData);
		keyboardController.frame();
		mouseController.frame();
		mobileController.frame();
		for (const input of inputs) {
			this.gamemode.runInput(input);
			this.inputs.push(this.Input.encode({
				...input,
				timestamp: this.clock
			}).finish());
		}
		const result = this.gamemode.quickEmulate(dt, this.clock);
		if (result !== null) {
			sendMessage({ soloRunInputs: {
				gamemode: this.gamemodeId,
				category: this.category,
				seed: this.seed,
				inputs: this.inputs
			} });
			dom.openSoloComponent(result);
			this.interrupted = true;
			return;
		}
		this.draw(dt);
		this.clock += dt;
		requestAnimationFrame(() => this.frame());
	}
};
//#endregion
//#region client/src/handlers/DynamicCssHandler.ts
function getFile(name) {
	return `${window.IMG_ROOT_PATH}/css-games/${name}.css`;
}
var DynamicCssHandler = class {
	loaded = /* @__PURE__ */ new Set();
	async load(name) {
		if (this.loaded.has(name)) return;
		const href = getFile(name);
		if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
			this.loaded.add(name);
			return;
		}
		await new Promise((resolve, reject) => {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = href;
			link.onload = () => {
				this.loaded.add(name);
				resolve();
			};
			link.onerror = () => {
				reject(/* @__PURE__ */ new Error(`Failed to load CSS: ${href}`));
			};
			document.head.appendChild(link);
		});
	}
};
var dynamicCssHandler = new DynamicCssHandler();
//#endregion
//#region client/src/dom/dom.ts
var STORAGE_KEY_CONNECTION = "ayke_connectionKey";
var MainComponent = class {
	currentPage = "home";
	templateLoader = new TemplateLoader();
	loadingContext = "home";
	isAuthenticated = false;
	pseudo = null;
	panel = new HomeComponent();
	y0 = 0;
	y1 = 0;
	startLoading() {
		this.loadingContext = this.currentPage;
		this.currentPage = "loading";
	}
	stopLoading() {
		this.currentPage = this.loadingContext;
	}
	uses(page) {
		return this.currentPage === page;
	}
	openHome() {
		this.panel = new HomeComponent();
		this.currentPage = "home";
	}
	openTest() {
		this.panel = null;
		this.currentPage = "test";
	}
	openLogin() {
		this.panel = new LoginComponent();
		this.currentPage = "login";
	}
	openSignin() {
		this.panel = new SigninComponent();
		this.currentPage = "signin";
	}
	/**
	* Attempt auto-login using a stored connection key from localStorage.
	*/
	tryLoginWithKey() {
		const key = localStorage.getItem(STORAGE_KEY_CONNECTION);
		if (key) sendMessage({ loginWithKey: key });
	}
	/**
	* Disconnect the current user, clear local connection state,
	* and inform the server.
	*/
	disconnect() {
		const key = localStorage.getItem(STORAGE_KEY_CONNECTION);
		if (key) {
			sendMessage({ deleteConnectionKey: key });
			localStorage.removeItem(STORAGE_KEY_CONNECTION);
		}
		this.isAuthenticated = false;
		this.openHome();
	}
	async openGamePanel(gamemode) {
		this.currentPage = "loading";
		const factory = getGmFactory(gamemode);
		let unlockedSkins;
		if (factory.type === "multiplayer") {
			if (factory.skins.length === 0) unlockedSkins = 0;
			else if (this.pseudo === null) unlockedSkins = [factory.skins[0]];
			else {
				sendMessage({ askSkins: gamemode });
				unlockedSkins = await waitSkinsResponsePromise();
			}
		}
		const html = await this.templateLoader.load(gamemode);
		this.currentPage = "game-panel";
		if (factory.type === "multiplayer") {
			const data = factory.dom(unlockedSkins);
			this.panel = new GamePanelComponent(gamemode, data, html);
		} else {
			const category = factory.dom();
			this.panel = new SoloGamePanelComponent(gamemode, category, html);
		}
	}
	async openWaitPlayPanel(gamemode) {
		this.panel = new WaitPlayPanelComponent(gamemode);
		this.currentPage = "wait-play";
	}
	openPlay() {
		const panel = this.getWaitPlayPanel();
		this.panel = panel.createPlay();
		this.currentPage = "play";
		deleteWaitingPlayHandler();
	}
	/**
	* Transition to the play-results page using the current PlayComponent
	* context to preserve pseudos and player metadata.
	*/
	openPlayResults(results) {
		const playPanel = this.getPanel(PlayComponent);
		this.panel = playPanel.createPlayResults(results);
		this.currentPage = "play-results";
		deleteGameHandler();
	}
	openSoloComponent(result) {
		this.panel = new SoloPlayResultComponent(result);
		this.currentPage = "play-solo-results";
	}
	openTutorialInPlay(gamemode) {
		this.currentPage = "play";
		this.panel = new TutorialInplayComponent(new LocalGameHandler(gamemode));
	}
	openSoloPlayComponent(gamemodeId, game, category) {
		this.panel = new SoloPlayComponent(gamemodeId, game, category);
		this.currentPage = "play";
	}
	openLeaderboard() {
		const panel = new LeaderboardComponent();
		this.panel = panel;
		this.currentPage = "leaderboard";
		panel.fetchLeaderboard();
	}
	openSoloLeaderboard() {
		const panel = new SoloLeaderboardComponent();
		this.panel = panel;
		this.currentPage = "solo-leaderboard";
		panel.fetchRecords();
	}
	getPanel(type) {
		if (this.panel instanceof type) return this.panel;
		throw new Error("Invalid type for panel");
	}
	getWaitPlayPanel() {
		return this.getPanel(WaitPlayPanelComponent);
	}
	getLoginPanel() {
		return this.getPanel(LoginComponent);
	}
	getSigninPanel() {
		return this.getPanel(SigninComponent);
	}
	getTutorialInplayComponent() {
		return this.getPanel(TutorialInplayComponent);
	}
	getLeaderboardPanel() {
		return this.getPanel(LeaderboardComponent);
	}
	getSoloLeaderboardPanel() {
		return this.getPanel(SoloLeaderboardComponent);
	}
};
var GamePanelComponent = class {
	gamemode;
	data;
	htmlContent;
	constructor(gamemode, data, htmlContent) {
		this.gamemode = gamemode;
		this.data = data;
		this.htmlContent = htmlContent;
	}
	uses(gamemode) {
		return this.gamemode === gamemode;
	}
	async play() {
		const factory = getMultiGmFactory(this.gamemode);
		dom.startLoading();
		await imageLoader.load(factory.textures, this.gamemode);
		await dynamicCssHandler.load(this.gamemode);
		dom.stopLoading();
		dom.openWaitPlayPanel(this.gamemode);
		sendMessage({ startGame: {
			gamemode: this.gamemode,
			data: this.data.produce()
		} });
	}
	async tutorial() {
		const factory = getMultiGmFactory(this.gamemode);
		dom.startLoading();
		await imageLoader.load(factory.textures, this.gamemode);
		await dynamicCssHandler.load(this.gamemode);
		dom.stopLoading();
		dom.openTutorialInPlay(this.gamemode);
	}
};
var SoloGamePanelComponent = class {
	gamemode;
	data;
	htmlContent;
	constructor(gamemode, data, htmlContent) {
		this.gamemode = gamemode;
		this.data = data;
		this.htmlContent = htmlContent;
	}
	uses(gamemode) {
		return this.gamemode === gamemode;
	}
	async play() {
		const factory = getSoloGmFactory(this.gamemode);
		dom.startLoading();
		await imageLoader.load(factory.textures);
		await dynamicCssHandler.load(this.gamemode);
		dom.stopLoading();
		dom.openSoloPlayComponent(this.gamemode, factory.create(), this.data.produce());
	}
};
var WaitPlayPanelComponent = class {
	gamemode;
	users = {};
	allowBots = false;
	logs = [];
	me = -1;
	constructor(gamemode) {
		this.gamemode = gamemode;
	}
	initComponent(me) {
		this.me = me;
	}
	add(user, identifier) {
		this.users = {
			...this.users,
			[identifier]: user
		};
		this.notify(`${this.showPseudo(user.pseudo)} joined the room`);
	}
	remove(identifier) {
		if (this.users[identifier]) {
			this.notify(`${this.showPseudo(this.users[identifier].pseudo)} left the room`);
			const updated = { ...this.users };
			delete updated[identifier];
			this.users = updated;
		}
	}
	updateBotAllow(user, identifier, allow) {
		this.users = {
			...this.users,
			[identifier]: {
				...user,
				allowBots: allow
			}
		};
		this.notify(`${this.showPseudo(user.pseudo)} ${allow ? "accepts" : "refuses"} bots`);
	}
	listUsers() {
		console.log("call", this.users);
		return Object.values(this.users);
	}
	showPseudo(pseudo) {
		if (pseudo) return escapeHTML(pseudo);
		return "<i>(anonymous)</i>";
	}
	notify(msg) {
		console.log(msg);
		this.logs.push(msg);
	}
	onAllowBotsChange() {
		sendMessage({ allowBotsOrder: this.allowBots });
	}
	/**
	* Creates a PlayComponent instance using the current connected users mapping.
	*/
	createPlay() {
		const pseudos = {};
		for (const [id, user] of Object.entries(this.users)) pseudos[Number(id)] = user.pseudo ?? null;
		return new PlayComponent(pseudos, this.me);
	}
};
var PlayComponent = class {
	pseudos;
	me;
	constructor(pseudos, me) {
		this.pseudos = pseudos;
		this.me = me;
	}
	/**
	* Creates a PlayResultsComponent instance carrying over player pseudos and the me identifier.
	*/
	createPlayResults(results) {
		return new PlayResultsComponent(results, this.pseudos, this.me);
	}
};
var SoloPlayComponent = class {
	game;
	text = "";
	constructor(gamemodeId, game, category) {
		this.game = new SoloGameHandler(gamemodeId, game, category);
		this.game.start();
	}
};
var PlayResultsComponent = class {
	results;
	pseudos;
	me;
	constructor(results, pseudos, me) {
		this.results = results;
		this.pseudos = pseudos;
		this.me = me;
	}
	/**
	* Helper method to render pseudo HTML safely within the Alpine component view.
	*/
	showPseudo(pseudo) {
		if (pseudo) return escapeHTML(pseudo);
		return "<i>(anonymous)</i>";
	}
	returnHome() {
		dom.openHome();
	}
};
var SoloPlayResultComponent = class {
	result;
	constructor(result) {
		this.result = result;
	}
	returnHome() {
		dom.openHome();
	}
};
var LoginComponent = class {
	pseudo = "";
	password = "";
	errorMessage = "";
	submitLogin() {
		this.errorMessage = "";
		sendMessage({ login: {
			pseudo: this.pseudo,
			password: this.password
		} });
	}
};
var SigninComponent = class {
	pseudo = "";
	password = "";
	errorMessage = "";
	submitSignin() {
		this.errorMessage = "";
		sendMessage({ createAccount: {
			pseudo: this.pseudo,
			password: this.password
		} });
	}
};
var HomeComponent = class {
	games;
	hasMobile = hasNavigatorMobile();
	hasMouse = hasNavigatorMouse();
	constructor() {
		this.games = [];
		for (const [key, gamemode] of Object.entries(gamemods)) {
			if ((key === "test" || key === "testSolo") && !window.DEBUG) continue;
			if (gamemode.type === "ui-separator") {
				this.games.push({
					category: gamemode.category,
					list: []
				});
				continue;
			}
			if (this.games.length === 0) continue;
			this.games[this.games.length - 1].list.push({
				key,
				computerOnly: gamemode.computerOnly,
				name: gamemode.name
			});
		}
	}
	isDisabled(gamemode) {
		const gm = gamemods[gamemode];
		if (!gm || gm.type === "ui-separator") return false;
		return gm.computerOnly && !this.hasMouse;
	}
	playGame(gamemode) {
		if (this.isDisabled(gamemode)) {
			alert("This game is reserved to PC players");
			return;
		}
		dom.openGamePanel(gamemode);
	}
};
var TutorialInplayComponent = class {
	game;
	TUTORIAL_MARKER = true;
	text = "";
	constructor(game) {
		this.game = game;
		dom.startLoading();
		game.start().finally(() => dom.stopLoading());
	}
	setText(text) {
		this.text = text;
	}
};
var LeaderboardComponent = class {
	entries = [];
	gamemode = null;
	page = 0;
	gamemods = gamemods;
	/**
	* Requests the latest leaderboard slice from the server based on current filters.
	*/
	fetchLeaderboard() {
		sendMessage({ askLeaderboard: {
			gamemode: this.gamemode,
			page: this.page
		} });
	}
	/**
	* Updates the current gamemode category, resets the page, and fetches new data.
	*/
	setGamemode(mode) {
		this.gamemode = mode;
		this.page = 0;
		this.fetchLeaderboard();
	}
	nextPage() {
		this.page++;
		this.fetchLeaderboard();
	}
	prevPage() {
		if (this.page > 0) {
			this.page--;
			this.fetchLeaderboard();
		}
	}
	rank(index) {
		if (index === 0) return this.page * 64 + 1;
		if (this.entries[index].trophees === this.entries[index - 1].trophees) return this.rank(index - 1);
		return this.page * 64 + index + 1;
	}
};
var SoloLeaderboardComponent = class {
	entries = [];
	gamemode;
	category;
	constructor() {
		this.gamemode = "";
		this.category = "";
		for (let key in gamemods) if (gamemods[key].type === "solo") {
			this.gamemode = key;
			this.category = gamemods[key].categories[0];
		}
	}
	page = 0;
	gamemods = Object.fromEntries(Object.entries(gamemods).filter(([_, factory]) => factory.type === "solo"));
	getCategories() {
		return getSoloGmFactory(this.gamemode).categories;
	}
	/**
	* Request the current solo leaderboard page from the server.
	*/
	fetchRecords() {
		sendMessage({ askSoloRecords: {
			gamemode: this.gamemode,
			category: this.category,
			page: this.page
		} });
	}
	/**
	* Update the selected game mode and reset the page.
	*/
	setGamemode(mode) {
		this.gamemode = mode;
		this.page = 0;
		this.fetchRecords();
	}
	/**
	* Update the selected category and reset the page.
	*/
	setCategory(category) {
		this.category = category;
		this.page = 0;
		this.fetchRecords();
	}
	/**
	* Go to the next leaderboard page.
	*/
	nextPage() {
		this.page++;
		this.fetchRecords();
	}
	/**
	* Go to the previous leaderboard page.
	*/
	prevPage() {
		if (this.page > 0) {
			this.page--;
			this.fetchRecords();
		}
	}
	/**
	* Calculate the rank of an entry, taking ties into account.
	*/
	rank(index) {
		if (index === 0) return this.page * 64 + 1;
		if (this.entries[index].score === this.entries[index - 1].score) return this.rank(index - 1);
		return this.page * 64 + index + 1;
	}
	/**
	* Replace the current leaderboard entries with the server response.
	*/
	setSoloRecords(d) {
		this.entries = d.entries;
	}
};
var dom = module_default.reactive(new MainComponent());
//#endregion
