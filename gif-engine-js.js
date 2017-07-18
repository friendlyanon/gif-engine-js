/* This program is free software. It comes without any warranty, to
 * the extent permitted by applicable law. You can redistribute it
 * and/or modify it under the terms of the Do What The Fuck You Want
 * To Public License, Version 2, as published by Sam Hocevar. See
 * http://www.wtfpl.net/ for more details. */

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
function GIF(source /* ArrayBuffer */, verbose = true /* Boolean */) {
  return new Promise(function(resolve, reject) {
    const start = performance.now();
    const length = source.byteLength;
    const log = verbose ? (msg => console.log(msg)) : (() => {});
    const buf = new Uint8Array(source);
    let pos = 5;
    log("GIF >");
    log("| Logical Screen Descriptor");
    const gif = {
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
    };
    if (gif.descriptor.packed.globalColorFlag) {
      log("| Global Color Table");
      const colors = 2 ** (gif.descriptor.packed.size + 1);
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
    }
    let frame = 0;
    const frame_template = () => ({
      graphicExtension: void 0,
      descriptor: void 0,
      localColorTable: void 0,
      lzw: 0,
      subBlocks: []
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
                transparentColorIndex: gce_view[++p] }; }
              break;
            case 0xFF: { // Application
              log("| | Application");
              const length = buf[++pos];
              if (length !== 11) { err_msg = "app extension of 11 byte length expected"; break loop; }
              if (buf[pos += length + 2] !== 1) { err_msg = "invalid app extension sub-block"; break loop; }
              gif.repeat = buf[++pos] | (buf[++pos] << 8);
              if (buf[++pos] !== 0) { err_msg = "missing null"; break loop; } }
              break;
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
              table[i] = new Uint8Array(3);
              p = -1;
              table[i][++p] = lct_view[i * 3 + p];
              table[i][++p] = lct_view[i * 3 + p];
              table[i][++p] = lct_view[i * 3 + p];
            }
            gif.frames[frame].descriptor.localColorTable = table;
          }
          log("| Image Data");
          const lzw = buf[++pos];
          if (lzw > 8 || 2 > lzw) {
            err_msg = "invalid LZW minimum code size";
            break loop;
          }
          gif.frames[frame].lzw = lzw;
          let p = -1;
          ++pos;
          while(buf[pos] !== 0) {
            log("| | Sub-block");
            const length = buf[pos];
            const sub = new Uint8Array(length);
            for (let i = 0, sub_view = new Uint8Array(source, ++pos, length); length > i; ++i)
              sub[i] = sub_view[i];
            gif.frames[frame].subBlocks[++p] = sub;
            pos += length;
          }
          ++pos; log(`| Frame #${++frame} processed`); }
          break;
        case 0x3B: // Tail
          log(`GIF processed in ${performance.now() - start} ms`);
          ++pos;
          break loop;
        default:
          err_msg = "unknown block";
          break loop;
      }
    }
    if (err_msg) {
      return reject(Error(`${err_msg}\n0x${buf[pos].toString(16).toUpperCase().padStart(2, 0)} @ 0x${pos.toString(16).toUpperCase().padStart(8, 0)}`));
    }
    if (pos !== length) log(`/!\\ Additional ${length - pos} bytes of data after tail ignored`);
    return resolve(gif);
  });
}
