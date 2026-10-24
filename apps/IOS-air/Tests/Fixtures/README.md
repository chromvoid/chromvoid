# Native UI fixtures

`credential-import.json` contains synthetic credential import data.

`file-export.png` is a synthetic 128×96 RGB PNG (274 bytes): alternating 32-pixel
squares in RGB (30, 200, 216), (24, 43, 72), and (242, 246, 250). No user image,
metadata, or credentials are embedded. `file-export.mp4` is a one-second silent
H.264 rendition, generated once with:

```sh
ffmpeg -loop 1 -i file-export.png -t 1 -r 10 -c:v libx264 \
  -pix_fmt yuv420p -movflags +faststart file-export.mp4
```

These files exercise real document import → Core storage → explicit export →
system Share/Photos. `scripts/prepare-ui-fixtures.sh` copies them only into the
isolated UI test host's Documents directory. They are not product demo content.
Building or running the tests does not require FFmpeg.
