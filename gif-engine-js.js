/* This program is free software. It comes without any warranty, to the extent
 * permitted by applicable law. You can redistribute it and/or modify it under
 * the terms of the Do What The Fuck You Want To Public License, Version 2,
 * as published by Sam Hocevar. See http://www.wtfpl.net/ for more details. */

/* For documentation please visit:
 * https://github.com/friendlyanon/gif-engine-js
 * by friendlyanon, 2017 */

const GIF = (() => {
  "use strict";
  const { isInteger } = Number;
  const { defineProperty, defineProperties } = Object;
  const GifObjSymbol = Symbol("isGifObject");
  const GifObjInterlaceSymbol = Symbol("isInterlacedGifObject");
  const LZW = async function(index, clearRawData = false) {
    if (!isInteger(index) || index < 0)
      throw new TypeError("`index` is not a valid number");
    if (!this[GifObjSymbol])
      throw new TypeError("`this` is not a GIF object");
    const frameObj = this.frames[index];
    if (frameObj.data)
      return frameObj.data;
    if (frameObj.rawData[0] === undefined) {
      if (clearRawData)
        frameObj.rawData = undefined;
      return frameObj.data = [0];
    }
    const {
      rawData: data,
      minCodeSize: size,
      descriptor: {
        width,
        height
      }
    } = frameObj;
    const pixelCount = width * height;
    const pixels = [];
    const prefix = [];
    const suffix = [];
    const pixelStack = [];
    const clear = 1 << size;
    const eoi = clear + 1;
    let available = clear + 2;
    let oldCode = -1;
    let codeSize = size + 1;
    let codeMask = (1 << codeSize) - 1;
    let code = 0;
    for (; clear > code; ++code)
      prefix[code] = 0, suffix[code] = code;
    let datum = 0;
    let bits = 0;
    let first = 0;
    let top = 0;
    let bi = 0;
    let pi = 0;
    let inCode;
    for (let i = 0; pixelCount > i;) {
      if (top === 0) {
        if (codeSize > bits) {	
          datum += data[bi] << bits;
          bits += 8;
          ++bi;
          continue;
        }
        code = datum & codeMask;
        datum >>= codeSize;
        bits -= codeSize;
        if (code > available || code === eoi)
          break;
        if (code === clear) {
          codeSize = size + 1;
          codeMask = (1 << codeSize) - 1;
          available = clear + 2;
          oldCode = -1;
          continue;
        }
        if (oldCode === -1) {
          pixelStack[top] = suffix[code];
          ++top;
          oldCode = code;
          first = code;
          continue;
        }
        inCode = code;
        if (code === available) {
          pixelStack[top] = first;
          code = oldCode;
          ++top;
        }
        while (code > clear) {
          pixelStack[top] = suffix[code];
          code = prefix[code];
          ++top;
        }
        first = suffix[code] & 0xFF;
        pixelStack[top] = first;
        ++top;
        if (4096 > available) {
          prefix[available] = oldCode;
          suffix[available] = first;
          if ((++available & codeMask) === 0 && 4096 > available) {
            ++codeSize;
            codeMask += available;
          }
        }
        oldCode = inCode;
      }
      pixels[pi] = pixelStack[--top];
      ++pi;
      ++i;
    }
    for (let i = pi; pixelCount > i; ++i)
      pixels[i] = 0;
    if (clearRawData)
      frameObj.rawData = undefined;
    return frameObj.data = pixels;
  };
  const deinterlace = async function(index, overwriteData = false) {
    if (!isInteger(index) || index < 0)
      throw new TypeError("`index` is not a valid number");
    if (!this[GifObjSymbol])
      throw new TypeError("`this` is not a GIF object");
    const frameObj = this.frames[index];
    if (!frameObj.descriptor.packed.interlaceFlag)
      throw new TypeError("Can't deinterlace a non-interlaced frame");
    if (this[GifObjInterlaceSymbol])
      return frameObj.deinterlacedData;
    if (!frameObj.data)
      await this.inflate(index, true);
    const {
      descriptor: { width },
      data,
      data: {
        length: l
      }
    } = frameObj;
    const rows = l / width;
    const newPixels = Array(l);
    const offsets = [0, 4, 2, 1];
    const steps = [8, 8, 4, 2];
    let fromRow = -1;
    for (let pass = 0; 4 > pass; ++pass)
      for (let toRow = offsets[pass]; rows > toRow; toRow += steps[pass])
        newPixels.splice(
          toRow * width,
          width,
          ...data.slice(++fromRow * width, (fromRow + 1) * width)
        );
    if (overwriteData) {
      frameObj.data = newPixels;
      frameObj.deinterlacedData = null;
    }
    else
      frameObj.deinterlacedData = newPixels;
    defineProperty(this, GifObjInterlaceSymbol, { value: true });
    return newPixels;
  };
  const defaultColorTable = Array(256).fill([0, 0, 0]);
  const toImageData = async function(index) {
    if (!isInteger(index) || index < 0)
      throw new TypeError("`index` is not a valid number");
    if (!this[GifObjSymbol])
      throw new TypeError("`this` is not a GIF object");
    const frameObj = this.frames[index];
    if (!frameObj.data)
      await this.inflate(index, true);
    const {
      interlaceFlag,
      localColorTableFlag
    } = frameObj.descriptor.packed;
    if (interlaceFlag && !this[GifObjInterlaceSymbol])
      await this.deinterlace(index, true);
    const data = frameObj.deinterlacedData || frameObj.data;
    const { width, height, left, top } = frameObj.descriptor;
    const length = width * height;
    const imageData = new Uint8ClampedArray(4 * length);
    const colorTable = (localColorTableFlag ?
      frameObj.localColorTable :
      this.globalColorTable) || defaultColorTable;
    const transparentColorIndex = frameObj.graphicExtension &&
      frameObj.graphicExtension.transparentColorIndex || 0;
    for (let i = 0, p = -1; length > i; ++i) {
      let code = data[i], color = colorTable[code];
      imageData[++p] = color[0];
      imageData[++p] = color[1];
      imageData[++p] = color[2];
      imageData[++p] = code === transparentColorIndex ? 0 : 255;
    }
    return [new ImageData(imageData, width, height), left, top];
  };
  const frameObjFactory = () => ({
    graphicExtension: undefined,
    deinterlacedData: undefined,
    localColorTable: undefined,
    minCodeSize: undefined,
    descriptor: undefined,
    rawData: undefined,
    data: undefined
  });
  const timerMethod = typeof performance === "object" &&
    typeof performance.now === "function" ?
      () => performance.now() :
      () => Date.now();
  const nativeLog = console.log;
  const noop = () => {};
  const GifMagic = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
  const NETSCAPE = [0x4E, 0x45, 0x54,
    0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30];
  const parser = async function(source, verbose = false) {
    typeCheck: {
      if (source != null && typeof source === "object") {
        if (source instanceof parser.Response)
          source = await source[parser.responseMethod]();
        if (source instanceof ArrayBuffer) break typeCheck;
        source = source.buffer;
        if (source instanceof ArrayBuffer) break typeCheck;
      }
      throw new TypeError("Source isn't a buffer");
    }
    const timer = verbose ? timerMethod : noop;
    const start = timer();
    const length = source.byteLength;
    const log = verbose ? nativeLog : noop;
    log("GIF >");
    const buf = new Uint8Array(source);
    let isGif = true;
    let pos = -1;
    for (let i = 0; 6 > i && isGif; ++i)
      isGif = GifMagic[i] === buf[++pos];
    if (!isGif)
      throw new TypeError("Source is not a GIF89a");
    log("| Logical Screen Descriptor");
    const gif = defineProperties({
      descriptor: {
        width: buf[++pos] | buf[++pos] << 8,
        height: buf[++pos] | buf[++pos] << 8,
        packed: {
          globalColorTableFlag: (buf[++pos] & 128) >> 7,
          colorResolution:
            ( buf[pos] & 64 | buf[pos] & 32 | buf[pos] & 16 ) >> 4,
          sortFlag: (buf[pos] & 8) >> 3,
          size: buf[pos] & 4 | buf[pos] & 2 | buf[pos] & 1
        },
        backgroundColorIndex: buf[++pos],
        pixelAspectRatio: buf[++pos] },
      globalColorTable: undefined,
      repeat: 0,
      frames: []
    }, {
      [GifObjSymbol]: { value: true },
      inflate: { value: LZW },
      deinterlace: { value: deinterlace },
      toImageData: { value: toImageData }
    });
    if (gif.descriptor.packed.globalColorTableFlag) {
      log("| Global Color Table");
      const colors = 2 ** (gif.descriptor.packed.size + 1);
      const gctView = new Uint8Array(source, ++pos, colors * 3);
      const table = Array(colors);
      for (let i = 0, p; colors > i; ++i, pos += 3) {
        const color = table[i] = [,,,];
        p = -1;
        color[++p] = gctView[i * 3 + p];
        color[++p] = gctView[i * 3 + p];
        color[++p] = gctView[i * 3 + p];
      }
      gif.globalColorTable = table;
    }
    else
      ++pos;
    let frameIndex = 0;
    let errMsg;
    loop:
    while(length > pos) {
      switch(buf[pos]) {
       case 0x21: // Extension
        log("| Extension");
        switch(buf[++pos]) {
         case 0xF9: { // Graphics Control
          log("| | Graphics Control");
          const length = buf[++pos];
          let p = 0, gceView = new Uint8Array(source, ++pos, length);
          if (buf[pos += length] !== 0) { errMsg = "missing null"; break loop; }
          if (!gif.frames[frameIndex])
            gif.frames[frameIndex] = frameObjFactory();
          let flag;
          gif.frames[frameIndex].graphicExtension = {
            disposalMethod:
              ( gceView[p] & 16 | gceView[p] & 8 | gceView[p] & 4 ) >> 2,
            userInputFlag: (gceView[p] & 2) >> 1,
            transparentColorFlag: flag = gceView[p] & 1,
            delay: (gceView[++p] | gceView[++p] << 8) * 10,
            transparentColorIndex: flag ? gceView[++p] : (++p, 0)
          };
        } break;
         case 0xFF: { // Application
          log("| | Application");
          const length = buf[++pos];
          if (length !== 11) {
            errMsg = "app extension header of 11 byte length expected";
            break loop;
          }
          let isNetscape = true;
          for (let i = 0; length > i && isNetscape; ++i)
            isNetscape = NETSCAPE[i] === buf[1 + i + pos];
          if (isNetscape) {
            if (buf[pos += length + 2] !== 1) {
              errMsg = "invalid NETSCAPE block";
              break loop;
            }
            gif.repeat = buf[++pos] | buf[++pos] << 8;
            if (buf[++pos] !== 0) { errMsg = "missing null"; break loop; }
          }
          else {
            while(buf[++pos] !== 0);
            ++pos;
          }
        } break;
         case 0xFE: // Comment
         case 0x01: // Plain Text
          while(buf[++pos] !== 0) pos += buf[pos];
          break;
         default:
          errMsg = "unknown extension";
          break loop;
        }
        ++pos;
        break;
       case 0x2C: { // Image Descriptor
        if (!gif.frames[frameIndex]) gif.frames[frameIndex] = frameObjFactory();
        const frameObj = gif.frames[frameIndex];
        log(`| Image Descriptor #${1 + frameIndex}`);
        let localColor;
        let size = 0;
        frameObj.descriptor = {
          left: buf[++pos] | buf[++pos] << 8,
          top: buf[++pos] | buf[++pos] << 8,
          width: buf[++pos] | buf[++pos] << 8,
          height: buf[++pos] | buf[++pos] << 8,
          packed: {
            localColorTableFlag: localColor = (buf[++pos] & 128) >> 7,
            interlaceFlag: (buf[pos] & 64) >> 6,
            sortFlag: (buf[pos] & 32) >> 5,
            size: size = buf[pos] & 4 | buf[pos] & 2 | buf[pos] & 1
          }
        };
        if (localColor) {
          log("| Local Color Table");
          const colors = 2 ** (size + 1);
          const lctView = new Uint8Array(source, ++pos, colors * 3);
          const table = Array(colors);
          for (let i = 0, p; colors > i; ++i, pos += 3) {
            const color = table[i] = [,,,];
            p = -1;
            color[++p] = lctView[i * 3 + p];
            color[++p] = lctView[i * 3 + p];
            color[++p] = lctView[i * 3 + p];
          }
          frameObj.localColorTable = table;
          --pos;
        }
        log("| Image Data");
        const lzw = buf[++pos];
        if (lzw > 8 || 2 > lzw) {
          errMsg = "invalid LZW minimum code size";
          break loop;
        }
        frameObj.minCodeSize = lzw;
        let totalLength = -1;
        const startPointer = ++pos;
        log("| | Counting total sub-block length");
        while(buf[pos] !== 0) {
          const length = buf[pos];
          totalLength += length;
          pos += length + 1;
        }
        if (totalLength < 1) {
          totalLength = 1;
        }
        log("| | Processing sub-block");
        const subBlockAccumulator = Array(totalLength);
        let accumulatorPointer = -1;
        pos = startPointer;
        while(buf[pos] !== 0) {
          const length = buf[pos];
          for (let i = 0; length > i; ++i)
            subBlockAccumulator[++accumulatorPointer] = buf[++pos];
          ++pos;
        }
        frameObj.rawData = subBlockAccumulator;
        log(`| | Sub-block processed`);
        ++pos; log(`| Frame #${++frameIndex} processed`);
      } break;
       case 0x3B: // Tail
        log(`GIF processed in ${timer() - start} ms`);
        ++pos;
        break loop;
       default:
        errMsg = "unknown block";
        break loop;
      }
    }
    if (errMsg)
      throw new TypeError(
        errMsg +
        `0x${buf[pos].toString(16).toUpperCase().padStart(2, 0)} @ ` +
        `0x${pos.toString(16).toUpperCase().padStart(8, 0)}`
      );
    if (pos !== length)
      console.warn(`/!\\ Additional ${
        length - pos
      } bytes of data after tail ignored`);
    return gif;
  };
  try { parser.Response = (window || self || global || this).Response; }
  catch (err) { console.error(err); }
  parser.responseMethod = "arrayBuffer";
  return parser;
})();
