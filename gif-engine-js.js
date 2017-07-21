/* This program is free software. It comes without any warranty, to
 * the extent permitted by applicable law. You can redistribute it
 * and/or modify it under the terms of the Do What The Fuck You Want
 * To Public License, Version 2, as published by Sam Hocevar. See
 * http://www.wtfpl.net/ for more details. */

/* jshint bitwise: false */

/**
 *  @brief GIF parser
 *  
 *  @param [in] source ArrayBuffer of an entire GIF file
 *  @param [in] ?verbose Display in `console` what is being processed
 *  @return Promise that resolves as an Object containing raw GIF data or
 *    rejects as an Error object with message marking the location of failure
 *  
 *  @details Function is not production ready yet, needs to have
 *    more methods for returning `ImageData` and LZW inflation
 */
let GIF;
{
  const GifObjSymbol = Symbol();
  const LZW = function(index = 0, clearRawData = false) {
    if (!this[GifObjSymbol])
      throw TypeError("`this` is not a GIF object");
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
    let old_code = -1;
    let code_size = size + 1;
    let code_mask = (1 << code_size) - 1;
    let code = 0;
    for (; code < clear; ++code)
      prefix[code] = 0, suffix[code] = code; // jshint ignore: line
    let datum = 0;
    let bits = 0;
    let first = 0;
    let top = 0;
    let bi = 0;
    let pi = 0;
    let in_code;
    for (let i = 0; i < pixelCount; ++i) {
      if (top === 0) {
        if (bits < code_size) {	
          datum += data[bi] << bits;
          bits += 8;
          ++bi;
          continue;
        }
        code = datum & code_mask;
        datum >>= code_size;
        bits -= code_size;
        if ((code > available) || (code === eoi))
          break;
        if (code === clear) {
          code_size = size + 1;
          code_mask = (1 << code_size) - 1;
          available = clear + 2;
          old_code = -1;
          continue;
        }
        if (old_code == -1) {
          pixelStack[top] = suffix[code];
          ++top;
          old_code = code;
          first = code;
          continue;
        }
        in_code = code;
        if (code === available) {
          pixelStack[top] = first;
          code = old_code;
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
        if (available < 4096) {
          prefix[available] = old_code;
          suffix[available] = first;
          if (((++available & code_mask) === 0) && (available < 4096)) {
            ++code_size;
            code_mask += available;
          }
        }
        old_code = in_code;
      }
      pixels[pi] = pixelStack[--top];
      ++pi;
    }
    for (let i = pi; i < pixelCount; ++i)
      pixels[i] = 0;
    if (clearRawData)
      this.frames[index].rawData = void 0;
    return (this.frames[index].data = pixels);
  };
  const deinterlace = function(index = 0) {
    // dummy
  };
  const toImageData = function() {
    // dummy
  };
  const parser = function(source /* ArrayBuffer */, verbose = false /* Boolean */) {
    return new Promise(function(resolve, reject) {
      const start = performance.now();
      const length = source.byteLength;
      const log = verbose ? console.log : () => {};
      const buf = new Uint8Array(source);
      let pos = 5;
      log("GIF >");
      log("| Logical Screen Descriptor");
      const gif = Object.defineProperty({
        descriptor: {
          width: buf[++pos] | (buf[++pos] << 8),
          height: buf[++pos] | (buf[++pos] << 8),
          packed: {
            globalColorFlag: (buf[++pos] & 128) >> 7,
            colorResolution: ( (buf[pos] & 64) | (buf[pos] & 32) | (buf[pos] & 16) ) >> 4,
            sortFlag: (buf[pos] & 8) >> 3,
            size: (buf[pos] & 4) | (buf[pos] & 2) | (buf[pos] & 1)
          },
          backgroundColorIndex: buf[++pos],
          pixelRatio: buf[++pos] },
        globalColorTable: void 0,
        repeat: 0,
        frames: []
      }, GifObjSymbol, { value: true });
      Object.defineProperties(gif, {
        inflate: { value: LZW },
        deinterlace: { value: deinterlace },
        toImageData: { value: toImageData }
      });
      if (gif.descriptor.packed.globalColorFlag) {
        log("| Global Color Table");
        const colors = 2 ** (gif.descriptor.packed.size + 1); // jshint ignore: line
        const gct_view = new Uint8Array(source, ++pos, colors * 3);
        const table = Array(colors);
        for (let i = 0, p = 0; colors > i; ++i, pos += 3) {
          table[i] = new Uint8Array(3);
          p = -1;
          table[i][++p] = gct_view[i * 3 + p];
          table[i][++p] = gct_view[i * 3 + p];
          table[i][++p] = gct_view[i * 3 + p];
        }
        gif.globalColorTable = table;
      } else ++pos;
      let frame = 0;
      const frame_template = () => ({
        graphicExtension: void 0,
        descriptor: void 0,
        localColorTable: void 0,
        minCodeSize: void 0,
        rawData: void 0
      });
      let err_msg = void 0;
      loop:
      for (;length > pos;) {
        switch(buf[pos]) {
          case 0x21: // Extension
            log("| Extension");
            switch(buf[++pos]) {
              case 0xF9: { // Graphics Control
                log("| | Graphics Control");
                const length = buf[++pos];
                let p = 0, gce_view = new Uint8Array(source, ++pos, length);
                if (buf[pos += length] !== 0) { err_msg = "missing null"; break loop; }
                if (!gif.frames[frame]) gif.frames[frame] = frame_template();
                gif.frames[frame].graphicExtension = {
                  disposal: ( (gce_view[p] & 16) | (gce_view[p] & 8) | (gce_view[p] & 4) ) >> 2,
                  userInputFlag: (gce_view[p] & 2) >> 1,
                  transparentColorFlag: gce_view[p] & 1,
                  delay: gce_view[++p] | (gce_view[++p] << 8),
                  transparentColorIndex: gce_view[++p] };
              } break;
              case 0xFF: { // Application
                log("| | Application");
                const length = buf[++pos];
                if (length !== 11) { err_msg = "app extension of 11 byte length expected"; break loop; }
                if (buf[pos += length + 2] !== 1) { err_msg = "invalid app extension sub-block"; break loop; }
                gif.repeat = buf[++pos] | (buf[++pos] << 8);
                if (buf[++pos] !== 0) { err_msg = "missing null"; break loop; }
              } break;
              case 0xFE: // Comment
              case 0x01: // Plain Text
                while(buf[++pos] !== 0) pos += buf[pos];
                break;
              default:
                err_msg = "unknown extension";
                break loop;
            }
            ++pos;
            break;
          case 0x2C: { // Image Descriptor
            if (!gif.frames[frame]) gif.frames[frame] = frame_template();
            log(`| Image Descriptor #${1+frame}`);
            let local_color = 0;
            let size = 0;
            gif.frames[frame].descriptor = {
              left: buf[++pos] | (buf[++pos] << 8),
              top: buf[++pos] | (buf[++pos] << 8),
              width: buf[++pos] | (buf[++pos] << 8),
              height: buf[++pos] | (buf[++pos] << 8),
              packed: {
                localColorTableFlag: local_color = (buf[++pos] & 128) >> 7,
                interlaceFlag: (buf[pos] & 64) >> 6,
                sortFlag: (buf[pos] & 32) >> 5,
                size: size = (buf[pos] & 4) | (buf[pos] & 2) | (buf[pos] & 1)
              }
            };
            if (local_color === 1) {
              log("| Local Color Table");
              const colors = 2 ** (size + 1); // jshint ignore: line
              const lct_view = new Uint8Array(source, ++pos, colors * 3);
              const table = Array(colors);
              for (let i = 0, p = 0; colors > i; ++i, pos += 3) {
                table[i] = new Uint8Array(3);
                p = -1;
                table[i][++p] = lct_view[i * 3 + p];
                table[i][++p] = lct_view[i * 3 + p];
                table[i][++p] = lct_view[i * 3 + p];
              }
              gif.frames[frame].localColorTable = table;
              --pos;
            }
            log("| Image Data");
            const lzw = buf[++pos];
            if (lzw > 8 || 2 > lzw) {
              err_msg = "invalid LZW minimum code size";
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
            const subBlockAccumulator = new Uint8Array(totalLength);
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
            err_msg = "unknown block";
            break loop;
        }
      }
      if (err_msg)
        return reject(Error(`${err_msg}\n0x${buf[pos].toString(16).toUpperCase().padStart(2, 0)} @ 0x${pos.toString(16).toUpperCase().padStart(8, 0)}`));
      if (pos !== length) log(`/!\\ Additional ${length - pos} bytes of data after tail ignored`);
      return resolve(gif);
    });
  };
  GIF = parser;
}
