git switch master &&
rm -rf client/dist &&
npm run bundle &&
rm -r client/dist/assets &&
cp -r client/public client/dist &&
cp client/index.html client/dist/index.html &&
cp scripts/copyIndexHtml.py client/dist/copyIndexHtml.py &&
git switch gh-pages &&
rm -rf public/
cp -r client/dist/public/. public/ &&
python3 client/dist/copyIndexHtml.py
