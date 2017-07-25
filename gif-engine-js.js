/* This program is free software. It comes without any warranty, to
 * the extent permitted by applicable law. You can redistribute it
 * and/or modify it under the terms of the Do What The Fuck You Want
 * To Public License, Version 2, as published by Sam Hocevar. See
 * http://www.wtfpl.net/ for more details. */

/**
 *  @brief GIF parser
 *  
 *  @param [in] source ArrayBuffer of an entire GIF file
 *  @param [in] ?verbose Display in `console` what is being processed, default = false
 *  @return Promise that resolves as an Object containing raw GIF data or
 *    rejects as an Error object with message marking the location of failure
 */
const GIF = (() => {
  const GifObjSymbol = Symbol();
  const GifObjInterlaceSymbol = Symbol();
  /**
   *  @brief LZW Decompressing for GIF
   *  
   *  @param [in] index Index of a frame to be inflated
   *  @param [in] ?clearRawData if true, then the `rawData` property of the source will be
   *    set to `undefined`
   *  @return Array containing the inflated data
   */
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
    let old_code = -1;
    let code_size = size + 1;
    let code_mask = (1 << code_size) - 1;
    let code = 0;
    for (; clear > code; ++code)
      prefix[code] = 0, suffix[code] = code;
    let datum = 0;
    let bits = 0;
    let first = 0;
    let top = 0;
    let bi = 0;
    let pi = 0;
    let in_code;
    for (let i = 0; pixelCount > i; ++i) {
      if (top === 0) {
        if (code_size > bits) {	
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
        if (old_code === -1) {
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
        if (4096 > available) {
          prefix[available] = old_code;
          suffix[available] = first;
          if (((++available & code_mask) === 0) && (4096 > available)) {
            ++code_size;
            code_mask += available;
          }
        }
        old_code = in_code;
      }
      pixels[pi] = pixelStack[--top];
      ++pi;
    }
    for (let i = pi; pixelCount > i; ++i)
      pixels[i] = 0;
    if (clearRawData)
      this.frames[index].rawData = void 0;
    return (this.frames[index].data = pixels);
  };
  /**
   *  @brief GIF Frame Deinterlacer
   *  
   *  @param [in] index Index of a frame to be deinterlaced
   *  @param [in] ?overwriteData if true, then the `data` property of the source will be
   *    set to the returned array of deinterlaced data
   *  @return Array containing the deinterlaced frame
   */
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
        newPixels.splice(toRow * width, width,
          ...data.slice(++fromRow * width, (fromRow + 1) * width)
        );
    if (overwriteData) {
      frame.data = newPixels;
      frame.deinterlacedData = null;
    } else
      frame.deinterlacedData = newPixels;
    Object.defineProperty(this, GifObjInterlaceSymbol, { value: true });
    return newPixels;
  };
  /**
   *  @brief Convert Frame Data into ImageData
   *  
   *  @param [in] index Index of a frame to be converted to ImageData
   *  @return Returns an ImageData object ready to be used in a canvas
   */
  const toImageData = async function(index) {
    if (!(Number.isInteger(index) && index > -1))
      throw new TypeError("`index` is not a valid number");
    if (!this[GifObjSymbol])
      throw new TypeError("`this` is not a GIF object");
    const frame = this.frames[index];
    if (!frame.data)
      await this.inflate(index, true);
    const interlace = frame.descriptor.packed.interlaceFlag === 1;
    if (interlace && !this[GifObjInterlaceSymbol])
      await this.deinterlace(index, true);
    const data = frame.deinterlacedData === null ? frame.data : frame.deinterlacedData;
    const { length } = data;
    const imageData = new Uint8ClampedArray(4 * length);
    const colorTable = frame.descriptor.packed.localColorTableFlag ? frame.localColorTable : this.globalColorTable;
    const { transparentColorIndex } = frame.graphicExtension;
    for (let i = 0, p = -1; colorTable.length > i; ++i) {
      let color = colorTable[i];
      imageData[++p] = color[0];
      imageData[++p] = color[1];
      imageData[++p] = color[2];
      imageData[++p] = i === transparentColorIndex ? 255 : 0;
    }
    return new ImageData(imageData, frame.descriptor.width, frame.descriptor.height);
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
      const gct_view = new Uint8Array(source, ++pos, colors * 3);
      const table = Array(colors);
      for (let i = 0, p = 0; colors > i; ++i, pos += 3) {
        table[i] = new Array(3);
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
      deinterlacedData: void 0,
      localColorTable: void 0,
      minCodeSize: void 0,
      descriptor: void 0,
      rawData: void 0,
      data: void 0
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
              let flag;
              gif.frames[frame].graphicExtension = {
                disposalMethod: ( (gce_view[p] & 16) | (gce_view[p] & 8) | (gce_view[p] & 4) ) >> 2,
                userInputFlag: (gce_view[p] & 2) >> 1,
                transparentColorFlag: flag = gce_view[p] & 1,
                delay: (gce_view[++p] | (gce_view[++p] << 8)) * 10,
                transparentColorIndex: flag ? gce_view[++p] : (++p, 0) };
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
            const colors = 2 ** (size + 1);
            const lct_view = new Uint8Array(source, ++pos, colors * 3);
            const table = Array(colors);
            for (let i = 0, p = 0; colors > i; ++i, pos += 3) {
              table[i] = new Array(3);
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
          err_msg = "unknown block";
          break loop;
      }
    }
    if (err_msg)
      throw new TypeError(`${err_msg}\n0x${buf[pos].toString(16).toUpperCase().padStart(2, 0)} @ 0x${pos.toString(16).toUpperCase().padStart(8, 0)}`);
    if (pos !== length) log(`/!\\ Additional ${length - pos} bytes of data after tail ignored`);
    return gif;
  };
  return parser;
})();
