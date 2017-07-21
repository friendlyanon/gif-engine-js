# gif-engine-js
Really basic JavaScript library written in ECMAScript 2017 for parsing
GIF files.

## Usage
```javascript
fetch("//url.to/my.gif") // request for a GIF file, can also be a filesystem
                         //  read if you use Node
    .then(response => response.arrayBuffer()) // grab the ArrayBuffer
    .then(GIF) // ArrayBuffer is first argument
    .then((gifObj, err) => {
      // code to manipulate raw GIF data or deal with error
      
      const inflatedFrameData = gifObj.inflate(0);
      // returns an array containing decompressed color codes of the first
      // frame and also expands the frame's object with this array
      // gifObj.frames[0].data === inflatedFrameData => true
    })
```

## Return object
`GIF` will resolve into an `[object Object]` if successfull. Will be referenced as
`gifObj` from here on out.

### Methods of a GIF object
These methods are non-enumerable, non-configurable and non-writeable properties
of `gifObj`.

* `inflate`: accepts two parameters `index, clearRawData`

  `index`: index of the frame to be processed, must be an **integer** bigger than `0`,
  will throw otherwise  
  `clearRawData`: if this parameter is set to any non-falsy value, then the
  `rawData` property of the source frame object will be set to `void 0`

  Returns an `[object Array]` containing the LZW decompressed color codes
  of the frame and expands `gifObj.frames[index]` with this array to the `data`
  property.

* `deinterlace`: `To Be Added`
* `toImageData`: `To Be Added`

### Properties of a GIF object
Property names are in line with the [GIF specification][2], for more detailed
explanation follow the link.

* `descriptor`:
 object containing the `Logical Screen Descriptor` - type: `[object Object]`
  * `width`:
   width of the GIF - type: `uint16`
  * `height`:
   height of the GIF - type: `uint16`
  * `backgroundColorIndex`:
   type: `uint8`
  * `pixelAspectRatio`:
   type: `uint8`
  * `packed`:
   the *packed* byte - type: `[object Object]`
    * `globalColorTableFlag`:
     indicates whether a `Global Color Table` is present or not -
     type: `int`, `0` or `1`
    * `colorResolution`:
     type: `int`
    * `sortFlag`:
     indicates whether the `Global Color Table` is sorted or not -
     type: `int`, `0` or `1`
    * `size`:
     indicates whether the size of `Global Color Table` -
     type: `int`, `0-7`
* `globalColorTable`: type: `[object Array]` if `globalColorTableFlag`
 equals `1`, otherwise `undefined`  
 individual colors are stored in `Uint8Array`s with the length of `3`
* `repeat`: number of times for the GIF to be repeated and `0` means
 repeat forever - type: `uint8`
* `frames`: array containing the frames of the GIF - type: `[object Array]`

### Properties of frame object
The details of the frames are stored in an `[object Object]`.

* `graphicExtension`:
 object containing the `Graphics Control Extension` - type: `[object Object]`
  * `disposalMethod`:
   type: `int`
  * `userInputFlag`:
   type: `int`, `0` or `1`
  * `transparentColorFlag`:
   type: `int`, `0` or `1`
  * `delay`:
   the duration of which the frame should be displayed for in milliseconds -
   type: `uint16`
  * `transparentColorIndex`:
   type: `uint8`
* `descriptor`:
 object containing the `Image Descriptor` - type: `[object Object]`
  * `left`:
   offset of the Image Data from the left of the GIF - type: `uint16`
  * `top`:
   offset of the Image Data from the top of the GIF - type: `uint16`
  * `width`:
   width of the Image Data - type: `uint16`
  * `height`:
   height of the Image Data - type: `uint16`
  * `packed`:
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
     indicates whether the size of `Local Color Table` -
     type: `int`, `0-7`
* `localColorTable`: type: `[object Array]` if `localColorTableFlag`
 equals `1`, otherwise `undefined`  
 individual colors are stored in `Uint8Array`s with the length of `3`
* `minCodeSize`:
 minimum code size required for color table building - type: `uint8`, `2-8`
* `rawData`: type: `[object Array]` containing the concatenated Image Data
 sub-blocks  
 individual bytes are stored as `int`s
* `data`:  **only present if `.inflate(index)` was used at least once**  
 type: `[object Array]` containing decompressed color codes
 individual codes are stored as `int`s

## Example
See [this Gist][1] for an example output.

## Todo
- Better documentation
- Provide more methods, e.g. for returning frames as `ImageData`
- _probably more_

## Sources
[What's In A GIF - Bit by Byte][3] - Very easy to understand and detailed blog
by Matthew Flickinger

[gifuct-js][4] - LZW and deinterlace by Matt Way

## License
WTFPL

[1]: https://gist.github.com/friendlyanon/2bf98ba6f15159590cf74502135f5c17
[2]: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
[3]: http://www.matthewflickinger.com/lab/whatsinagif/bits_and_bytes.asp
[4]: https://github.com/matt-way/gifuct-js
