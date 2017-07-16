/* This program is free software. It comes without any warranty, to
 * the extent permitted by applicable law. You can redistribute it
 * and/or modify it under the terms of the Do What The Fuck You Want
 * To Public License, Version 2, as published by Sam Hocevar. See
 * http://www.wtfpl.net/ for more details. */

/**
 *  @brief The GIF parser
 *  
 *  @param [in] buf ArrayBuffer of an entire GIF file
 *  @param [in] ?verbose Display in `console` what is being processed
 *  @return Object containing raw GIF data
 *  
 *  @details Function is not production ready yet, needs to have
 *    more methods for returning `ImageData` and LZW inflation
 */
function GIF(buf /* ArrayBuffer */, verbose = false /* Boolean */) {
  const length = buf.byteLength;
  const log = verbose ? (msg => console.log(msg)) : (() => {});
  buf = new Uint8Array(buf);
  let pos = 5;
  log("GIF >");
  log("| Logical Screen Descriptor");
  const gif = {
    descriptor: {
      width: buf[++pos] | (buf[++pos] << 8),
      height: buf[++pos] | (buf[++pos] << 8),
      packed: {
        g_colour: (buf[++pos] & 128) >> 7,
        cres: ( (buf[pos] & 64) | (buf[pos] & 32) | (buf[pos] & 16) ) >> 4,
        sort: (buf[pos] & 8) >> 3,
        size: (buf[pos] & 4) | (buf[pos] & 2) | (buf[pos] & 1)
      },
      bg_colour_i: buf[++pos],
      ratio: buf[++pos] },
    g_colour_t: void 0,
    repeat: 0,
    frames: []
  };
  if (gif.descriptor.packed.g_colour) {
    log("| Global Colour Table");
    const colours = 2 ** (gif.descriptor.packed.size + 1);
    const gct_view = new Uint8Array(buf.buffer, ++pos, colours * 3);
    const table = Array(colours);
    for (let i = 0, p = 0; colours > i; ++i, pos += 3) {
      table[i] = new Uint8Array(3);
      p = -1;
      table[i][++p] = gct_view[i * 3 + p];
      table[i][++p] = gct_view[i * 3 + p];
      table[i][++p] = gct_view[i * 3 + p];
    }
    gif.g_colour_t = table;
  }
  let frame = 0;
  const frame_template = () => ({
    graphic_ex: void 0,
    descriptor: void 0,
    colour_t: void 0,
    lzw: 0,
    subblocks: []
  });
  const err = msg => {
    msg += `\n0x${buf[pos].toString(16).toUpperCase().padStart(2, 0)} @ 0x${pos.toString(16).toUpperCase().padStart(2, 0)}`;
    return Error(msg);
  };
  while(pos < length) {
    switch(buf[pos]) {
      case 0x21: // Extension
        log("| Extension");
        switch(buf[++pos]) {
          case 0xF9: { // Graphics Control
            log("| | Graphics Control");
            const length = buf[++pos];
            let p = 0, gce_view = new Uint8Array(buf.buffer, ++pos, length);
            if (buf[pos += length] !== 0) throw err(`missing null`);
            if (!gif.frames[frame]) gif.frames[frame] = frame_template();
            gif.frames[frame].graphic_ex = {
              disposal: ( (gce_view[p] & 16) | (gce_view[p] & 8) | (gce_view[p] & 4) ) >> 2,
              userInputFlag: (gce_view[p] & 2) >> 1,
              transparentColourFlag: gce_view[p] & 1,
              delay: gce_view[++p] | (gce_view[++p] << 8),
              transparentColourIndex: gce_view[++p] }; }
            break;
          case 0xFF: { // Application
            log("| | Application");
            const length = buf[++pos];
            if (length !== 11) throw err(`app extension of 11 byte length expected`);
            if (buf[pos += length + 2] !== 1) throw err(`invalid app extension sub-block`);
            gif.repeat = buf[++pos] | (buf[++pos] << 8);
            if (buf[++pos] !== 0) throw err(`missing null`); }
            break;
          case 0xFE: // Comment
          case 0x01: // Plain Text
            while(buf[++pos] !== 0) pos += buf[pos];
            break;
          default:
            throw err(`unknown extension`);
        }
        ++pos;
        break;
      case 0x2C: { // Image Descriptor
        if (!gif.frames[frame]) gif.frames[frame] = frame_template();
        log(`| Image Descriptor #${1+frame}`);
        let local_colour = 0;
        let size = 0;
        gif.frames[frame].descriptor = {
          left: buf[++pos] | (buf[++pos] << 8),
          top: buf[++pos] | (buf[++pos] << 8),
          width: buf[++pos] | (buf[++pos] << 8),
          height: buf[++pos] | (buf[++pos] << 8),
          packed: {
            localColourTableFlag: local_colour = (buf[++pos] & 128) >> 7,
            interlaceFlag: (buf[pos] & 64) >> 6,
            sortFlag: (buf[pos] & 32) >> 5,
            size: size = (buf[pos] & 4) | (buf[pos] & 2) | (buf[pos] & 1)
          }
        };
        if (local_colour === 1) {
          log("| Local Colour Table");
          const colours = 2 ** (size + 1);
          const lct_view = new Uint8Array(buf.buffer, ++pos, colours * 3);
          const table = Array(colours);
          for (let i = 0, p = 0; colours > i; ++i, pos += 3) {
            table[i] = new Uint8Array(3);
            p = -1;
            table[i][++p] = lct_view[i * 3 + p];
            table[i][++p] = lct_view[i * 3 + p];
            table[i][++p] = lct_view[i * 3 + p];
          }
          gif.frames[frame].descriptor.l_colour_t = table;
        }
        log("| Image Data");
        gif.frames[frame].lzw = buf[++pos];
        let p = -1;
        ++pos;
        while(buf[pos] !== 0) {
          log("| | Sub-block");
          const length = buf[pos];
          gif.frames[frame].subblocks[++p] = new Uint8Array(buf.buffer, ++pos, length);
          pos += length;
        }
        ++pos; log(`| Frame #${++frame} processed`); }
        break;
      case 0x3B: // Tail
        log("GIF processed");
        ++pos;
        break;
      default:
        throw err(`unknown block`);
    }
  }
  return gif;
}
