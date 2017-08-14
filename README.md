# gif-engine-js
Really basic JavaScript library written in ECMAScript 2017 for parsing GIF
(/gɪf/ **not** /ˈdʒɪf/) files.

## Usage
```javascript
fetch("//url.to/my.gif") /* request for a GIF file, can also be a filesystem
                          * read if you use Node or similar */
    .then(response => response.arrayBuffer()) // grab the ArrayBuffer
    .then(GIF)                                // ArrayBuffer is first argument
    .then(async (gifObj, err) => {
      // code to manipulate raw GIF data or deal with error

      const inflatedFrameData = await gifObj.inflate(0);
      /* returns an array containing decompressed color codes of the first
       * frame and also expands the frame's object with this array
       * gifObj.frames[0].data === inflatedFrameData => true */

      const deinterlacedFrameData = await gifObj.deinterlace(0);
      /* returns an array containing deinterlaced color codes of the first
       * frame and also expands the frame's object with this array
       * gifObj.frames[0].deinterlacedData === deinterlacedFrameData => true
       *
       * please note that you can call this function without calling
       * .inflate() first, because it will call it for you when the `data`
       * property is missing */

      const imageData = await gifObj.toImageData(0);
      /* returns an ImageData object ready to be used in a <canvas>
       * using this will NOT extend gifObj.frames[0] with an properties
       *
       * please note that you can call this function without calling
       * .inflate() first *and .deinterlace() if necessary*, because it
       * will call them for you when necessary */
    })
```

## Motivation
I needed a versatile library to process GIFs for personal use, but the already
available libraries out there all came with extra fluff that made it look
difficult to achieve what I wanted using them.

## Return object
`GIF` will resolve into an `Object` if successfull. Will be referenced
as `gifObj` from here on out. Please do note that a `gifObj` contains `function`
methods and `Symbol` properties, so [structured clone algorithm][6] will fail to
copy it properly to a worker. Importing the library into a worker itself is
recommended instead.

### Methods of a GIF object
These methods are, non-enumerable, non-configurable and non-writeable properties
of `gifObj`. They are also asynchronous, non-generic functions that will throw
if `this` is not a `gifObj`.

* `inflate`: accepts two parameters `index, ?clearRawData`

  `index`: index of the frame to be processed, must be an `int` bigger than `0`,
  will throw otherwise  
  `?clearRawData`: if this parameter is set to any truthy value, then the
  `rawData` property of `gifObj.frames[index]` will be set to `void 0`

  Returns an `Array` containing the LZW decompressed color codes
  of the frame and expands `gifObj.frames[index]` with this array to the `data`
  property.

* `deinterlace`: accepts two parameters `index, ?overwriteData`

  `index`: index of the frame to be processed, must be an `int` bigger than `0`,
  will throw otherwise  
  `?overwriteData`: if this parameter is set to any truthy value, then the
  `data` property of `gifObj.frames[index]` will be overwritten with the result

  Returns an `Array` containing the deinterlaced color codes
  of the frame and expands `gifObj.frames[index]` with this array to the
  `deinterlacedData` property. If `overwriteData` is true, then `data` will
  contain the result and `deinterlacedData` will be set to `null`. If the user
  didn't use `.inflate()`, then this function will do that with the optional
  parameter (`clearRawData`) set to true, to avoid needlessly taking up memory
  space. This method will only be called if the user omitted preprocessing the
  frames themselves.

* `toImageData`: accepts one parameter `index`

  `index`: index of the frame to be processed, must be an `int` bigger than `0`,
  will throw otherwise

  Returns an `Array` with this structure: `[ImageData, offsetLeft, offsetTop]`.
  It is recommended to destructure this array as parameters like so
  `ctx.putImageData(...gifObj.toImageData(0))`. If the user didn't use
  `.inflate()` *or `.deinterlace()` if needed*, then this function will do that
  with both optional parameters (`clearRawData`, `overwriteData`) set to true,
  to avoid needlessly taking up memory space. These methods will only be called
  if the user omitted preprocessing the frames themselves.

### Properties of a GIF object
Property names are in line with the [GIF specification][2], for more detailed
explanation follow the link. `gifObj` also contains 2 `Symbol` properties for
internal uses.

* `descriptor`:
 object containing the `Logical Screen Descriptor` - type: `Object`
  * `width`:
   width of the GIF - type: `uint16`
  * `height`:
   height of the GIF - type: `uint16`
  * `backgroundColorIndex`:
   type: `uint8`
  * `pixelAspectRatio`:
   type: `uint8`
  * `packed`:
   the *packed* byte - type: `Object`
    * `globalColorTableFlag`:
     indicates whether a `Global Color Table` is present or not -
     type: `int`, `0` or `1`
    * `colorResolution`:
     type: `int`
    * `sortFlag`:
     indicates whether the `Global Color Table` is sorted or not -
     type: `int`, `0` or `1`
    * `size`:
     indicates the size of `Global Color Table` (`2 ** ( size + 1 )`) -
     type: `int`, `0-7`
* `globalColorTable`:
 type: `Array` if `globalColorTableFlag` equals `1`, otherwise `undefined`  
 individual colors are stored in `Array`s with the length of `3`
* `repeat`:
 number of times for the GIF to be repeated, where `0` means repeat forever -
 type: `uint8`
* `frames`:
 array containing the frames of the GIF -
 type: `Array`

### Properties of frame object
The details of the frames are stored in an `Object`.

* `graphicExtension`:
 object containing the `Graphics Control Extension` - type: `Object`
  * `disposalMethod`:
   type: `int`, `0-7`
  * `userInputFlag`:
   type: `int`, `0` or `1`
  * `transparentColorFlag`:
   type: `int`, `0` or `1`
  * `delay`:
   the duration of which the frame should be displayed for
   **in milliseconds** - type: `int`
  * `transparentColorIndex`:
   type: `uint8`
* `descriptor`:
 object containing the `Image Descriptor` - type: `Object`
  * `left`:
   offset of the Image Data from the left of the GIF - type: `uint16`
  * `top`:
   offset of the Image Data from the top of the GIF - type: `uint16`
  * `width`:
   width of the Image Data - type: `uint16`
  * `height`:
   height of the Image Data - type: `uint16`
  * `packed`:
   the *packed* byte - type: `Object`
    * `localColorTableFlag`:
     indicates whether a `Local Color Table` is present or not -
     type: `int`, `0` or `1`
    * `interlaceFlag`:
     indicates whether the color codes are interlaced or not -
     type: `int`, `0` or `1`
    * `sortFlag`:
     indicates whether the `Local Color Table` is sorted or not -
     type: `int`, `0` or `1`
    * `size`:
     indicates the size of `Local Color Table` (`2 ** ( size + 1 )`) -
     type: `int`, `0-7`
* `localColorTable`:
 type: `Array` if `localColorTableFlag` equals `1`, otherwise `undefined`  
 individual colors are stored in `Array`s with the length of `3`
* `minCodeSize`:
 minimum code size required for color table building - type: `uint8`, `2-8`
* `rawData`:
 contains the concatenated Image Data sub-blocks - type: `Array`,
 will be `undefined` if you call `.inflate(index, true)`  
 individual bytes are stored as `uint8`s
* `data`:
 contains decompressed color codes - type: `Array`
 if `.inflate()` was called, otherwise `undefined`  
 individual codes are stored as `uint8`s
* `deinterlacedData`:
 contains deinterlaced color codes - type: `Array`
 if `.deinterlace()` was called or `null` if `.deinterlace(index, true)` was
 called, otherwise `undefined`  
 individual codes are stored as `uint8`s

## Example
See [the project page][1] on my GitHub Pages for an example usage.
Worker addition can be found in [this Gist][5].

## Sources
[What's In A GIF - Bit by Byte][3] - Very easy to understand and detailed blog
by Matthew Flickinger  
[gifuct-js][4] - LZW and deinterlace by Matt Way

## License
WTFPL

[1]: https://friendlyanon.github.io/gif-engine-js/
[2]: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
[3]: http://www.matthewflickinger.com/lab/whatsinagif/bits_and_bytes.asp
[4]: https://github.com/matt-way/gifuct-js
[5]: https://gist.github.com/friendlyanon/c63fe71a01001ce744b94cb65a8fca1e
[6]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
