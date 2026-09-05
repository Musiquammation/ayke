git switch master &&
npm run build &&
find client/dist -type f -name '*.js' -delete &&
npm run build-bundle &&
cp client/index.html dist/ &&
git switch gh-pages &&
cp -r client/dist/. public/ &&
python3 scripts/copyIndexHtml.py
