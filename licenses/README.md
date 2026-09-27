# Bundled runtime notices

ONNX Runtime LICENSE and ThirdPartyNotices.txt are copied without modification from the runtime revision used by onnxruntime-web 1.22.0-dev.20250409-89f8206ba4:

- https://github.com/microsoft/onnxruntime/blob/89f8206ba4/LICENSE
- https://github.com/microsoft/onnxruntime/blob/89f8206ba4/ThirdPartyNotices.txt

`scripts/copy-licenses.mjs` copies these notices and installed browser dependency license files to `dist/licenses` during builds. Update these notices when changing the runtime version. No pretrained model is covered by or included in this npm distribution.
