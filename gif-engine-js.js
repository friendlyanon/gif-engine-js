/* This program is free software. It comes without any warranty, to
 * the extent permitted by applicable law. You can redistribute it
 * and/or modify it under the terms of the Do What The Fuck You Want
 * To Public License, Version 2, as published by Sam Hocevar. See
 * http://www.wtfpl.net/ for more details. */

// For documentation please visit:
// https://github.com/friendlyanon/gif-engine-js
// by friendlyanon, 2017

const GIF = (() => {
  const GifObjSymbol = Symbol();
  const GifObjInterlaceSymbol = Symbol();
  const LZW = async function(index, clearRawData = false) {
    if (!(Number.isInteger(index) && index > -1))
      throw new TypeError("`index` is not a valid number");
    if (!this[GifObjSymbol])
      throw new TypeError("`this` is not a GIF object");
    if (this.frames[index].data)
      return this.frames[index].data;
    const { rawData: data, minCodeSize: size, descriptor: { width, height } } = this.frames[index];
    const pixelCount = width * height;
    const pixels = new Array(pixelCount);
    const prefix = new Array(4096);
    const suffix = new Array(4096);
    const pixelStack = new Array(4097);
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
        if ((code > available) || (code === eoi))
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
          if (((++available & codeMask) === 0) && (4096 > available)) {
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
      this.frames[index].rawData = void 0;
    return (this.frames[index].data = pixels);
  };
  const deinterlace = async function(index, overwriteData = false) {
    if (!(Number.isInteger(index) && index > -1))
      throw new TypeError("`index` is not a valid number");
    if (!this[GifObjSymbol])
      throw new TypeError("`this` is not a GIF object");
    const frame = this.frames[index];
    if (frame.descriptor.packed.interlaceFlag === 0)
      throw new TypeError("Can't deinterlace a non-interlaced frame");
    if (this[GifObjInterlaceSymbol])
      return frame.deinterlacedData;
    if (!frame.data)
      await this.inflate(index, true);
    const { descriptor: { width }, data, data: { length: l } } = frame;
    const rows = l / width;
    const newPixels = new Array(l);
    const offsets = [0, 4, 2, 1];
    const steps = [8, 8, 4, 2];
    let fromRow = -1;
    for (let pass = 0; 4 > pass; ++pass)
      for (let toRow = offsets[pass]; rows > toRow; toRow += steps[pass])
        newPixels.splice(toRow * width, width, ...data.slice(++fromRow * width, (fromRow + 1) * width));
    if (overwriteData) {
      frame.data = newPixels;
      frame.deinterlacedData = null;
    } else
      frame.deinterlacedData = newPixels;
    Object.defineProperty(this, GifObjInterlaceSymbol, { value: true });
    return newPixels;
  };
  const toImageData = async function(index) {
    if (!(Number.isInteger(index) && index > -1))
      throw new TypeError("`index` is not a valid number");
    if (!this[GifObjSymbol])
      throw new TypeError("`this` is not a GIF object");
    const frame = this.frames[index];
    if (!frame.data)
      await this.inflate(index, true);
    if (frame.descriptor.packed.interlaceFlag === 1 && !this[GifObjInterlaceSymbol])
      await this.deinterlace(index, true);
    const data = frame.deinterlacedData || frame.data;
    const { width, height, left, top } = frame.descriptor;
    const length = width * height;
    const imageData = new Uint8ClampedArray(4 * length);
    const colorTable = frame.descriptor.packed.localColorTableFlag ? frame.localColorTable : this.globalColorTable;
    const { transparentColorIndex } = frame.graphicExtension;
    for (let i = 0, p = -1; length > i; ++i) {
      let code = data[i], color = colorTable[code];
      imageData[++p] = color[0];
      imageData[++p] = color[1];
      imageData[++p] = color[2];
      imageData[++p] = code === transparentColorIndex ? 0 : 255;
    }
    return [new ImageData(imageData, width, height), left, top];
  };
  const parser = async function(source /* ArrayBuffer */, verbose = false /* Boolean */) {
    const start = performance.now();
    const length = source.byteLength;
    const log = verbose ? console.log : () => {};
    const buf = new Uint8Array(source);
    let pos = 5;
    log("GIF >");
    log("| Logical Screen Descriptor");
    const gif = Object.defineProperties({
      descriptor: {
        width: buf[++pos] | (buf[++pos] << 8),
        height: buf[++pos] | (buf[++pos] << 8),
        packed: {
          globalColorTableFlag: (buf[++pos] & 128) >> 7,
          colorResolution: ( (buf[pos] & 64) | (buf[pos] & 32) | (buf[pos] & 16) ) >> 4,
          sortFlag: (buf[pos] & 8) >> 3,
          size: (buf[pos] & 4) | (buf[pos] & 2) | (buf[pos] & 1)
        },
        backgroundColorIndex: buf[++pos],
        pixelAspectRatio: buf[++pos] },
      globalColorTable: void 0,
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
      for (let i = 0, p = 0; colors > i; ++i, pos += 3) {
        table[i] = new Array(3);
        p = -1;
        table[i][++p] = gctView[i * 3 + p];
        table[i][++p] = gctView[i * 3 + p];
        table[i][++p] = gctView[i * 3 + p];
      }
      gif.globalColorTable = table;
    } else ++pos;
    let frame = 0;
    const frameTemplate = () => ({
      graphicExtension: void 0,
      deinterlacedData: void 0,
      localColorTable: void 0,
      minCodeSize: void 0,
      descriptor: void 0,
      rawData: void 0,
      data: void 0
    });
    const NETSCAPE = [0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30];
    let errMsg = void 0;
    loop:
    for (;length > pos;) {
      switch(buf[pos]) {
       case 0x21: // Extension
        log("| Extension");
        switch(buf[++pos]) {
         case 0xF9: { // Graphics Control
          log("| | Graphics Control");
          const length = buf[++pos];
          let p = 0, gceView = new Uint8Array(source, ++pos, length);
          if (buf[pos += length] !== 0) { errMsg = "missing null"; break loop; }
          if (!gif.frames[frame]) gif.frames[frame] = frameTemplate();
          let flag;
          gif.frames[frame].graphicExtension = {
            disposalMethod: ( (gceView[p] & 16) | (gceView[p] & 8) | (gceView[p] & 4) ) >> 2,
            userInputFlag: (gceView[p] & 2) >> 1,
            transparentColorFlag: flag = gceView[p] & 1,
            delay: (gceView[++p] | (gceView[++p] << 8)) * 10,
            transparentColorIndex: flag ? gceView[++p] : (++p, 0) };
        } break;
         case 0xFF: { // Application
          log("| | Application");
          const length = buf[++pos];
          if (length !== 11) { errMsg = "app extension header of 11 byte length expected"; break loop; }
          let isNetscape = true;
          for (let i = 0; length > i && isNetscape; ++i)
            isNetscape = NETSCAPE[i] === buf[1 + i + pos];
          if (isNetscape) {
            if (buf[pos += length + 2] !== 1) { errMsg = "invalid NETSCAPE block"; break loop; }
            gif.repeat = buf[++pos] | (buf[++pos] << 8);
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
        if (!gif.frames[frame]) gif.frames[frame] = frameTemplate();
        log(`| Image Descriptor #${1+frame}`);
        let localColor = 0;
        let size = 0;
        gif.frames[frame].descriptor = {
          left: buf[++pos] | (buf[++pos] << 8),
          top: buf[++pos] | (buf[++pos] << 8),
          width: buf[++pos] | (buf[++pos] << 8),
          height: buf[++pos] | (buf[++pos] << 8),
          packed: {
            localColorTableFlag: localColor = (buf[++pos] & 128) >> 7,
            interlaceFlag: (buf[pos] & 64) >> 6,
            sortFlag: (buf[pos] & 32) >> 5,
            size: size = (buf[pos] & 4) | (buf[pos] & 2) | (buf[pos] & 1)
          }
        };
        if (localColor === 1) {
          log("| Local Color Table");
          const colors = 2 ** (size + 1);
          const lctView = new Uint8Array(source, ++pos, colors * 3);
          const table = Array(colors);
          for (let i = 0, p = 0; colors > i; ++i, pos += 3) {
            table[i] = new Array(3);
            p = -1;
            table[i][++p] = lctView[i * 3 + p];
            table[i][++p] = lctView[i * 3 + p];
            table[i][++p] = lctView[i * 3 + p];
          }
          gif.frames[frame].localColorTable = table;
          --pos;
        }
        log("| Image Data");
        const lzw = buf[++pos];
        if (lzw > 8 || 2 > lzw) {
          errMsg = "invalid LZW minimum code size";
          break loop;
        }
        gif.frames[frame].minCodeSize = lzw;
        let totalLength = -1;
        const startPointer = ++pos;
        log("| | Counting total sub-block length");
        while(buf[pos] !== 0) {
          const length = buf[pos];
          totalLength += length;
          pos += length + 1;
        }
        log("| | Processing sub-block");
        const subBlockAccumulator = new Array(totalLength);
        let accumulatorPointer = -1;
        pos = startPointer;
        while(buf[pos] !== 0) {
          const length = buf[pos];
          for (let i = 0; length > i; ++i)
            subBlockAccumulator[++accumulatorPointer] = buf[++pos];
          ++pos;
        }
        gif.frames[frame].rawData = subBlockAccumulator;
        log(`| | Sub-block processed`);
        ++pos; log(`| Frame #${++frame} processed`);
      } break;
       case 0x3B: // Tail
        log(`GIF processed in ${performance.now() - start} ms`);
        ++pos;
        break loop;
      default:
        errMsg = "unknown block";
        break loop;
      }
    }
    if (errMsg)
      throw new TypeError(`${errMsg}\n0x${buf[pos].toString(16).toUpperCase().padStart(2, 0)} @ 0x${pos.toString(16).toUpperCase().padStart(8, 0)}`);
    if (pos !== length) log(`/!\\ Additional ${length - pos} bytes of data after tail ignored`);
    return gif;
  };
  return parser;
})();
