# gif-engine-js
Really basic JavaScript library for parsing GIF files written in
ECMAScript 2017.

## Usage
```javascript
fetch("//url.to/my.gif") // request for a GIF file, can also be a
                         // filesystem read if you use Node
    .then(response => response.arrayBuffer()) // grab the ArrayBuffer
    .then(buffer => {
        var objGif = GIF(buffer, /* true */); // synchronous as of now
        // code to deal with raw GIF data
    })
```

## Example
See [this Gist][1] for an example output.

## Todo
- Better documentation
- More useful error reporting
- Promisify
- Provide more methods, e.g. for returning frames as `ImageData`
- LZW inflation using asm.js
- _probably more_

## License
WTFPL

[1]: https://gist.github.com/friendlyanon/2bf98ba6f15159590cf74502135f5c17
