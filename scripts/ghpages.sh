git switch master &&
npm run build &&
find client/dist -type f -name '*.js' -delete &&
npm run build-bundle &&
cp client/index.html dist/ &&
cp scripts/copyIndexHtml.py dist/copyIndexHtml.py &&
git switch gh-pages &&
cp -r client/dist/. public/ &&
python3 dist/copyIndexHtml.py
