git switch master &&
rm -rf client/dist &&
cp -r client/public client/dist &&
npm run bundle &&
rm -r client/dist/assets &&
cp client/index.html dist/ &&
cp scripts/copyIndexHtml.py dist/copyIndexHtml.py &&
git switch gh-pages &&
cp -r client/dist/. public/ &&
python3 dist/copyIndexHtml.py
