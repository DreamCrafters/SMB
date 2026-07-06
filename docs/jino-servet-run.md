cd ~/domains/smb.aonmou.ru/app

git pull --ff-only origin Dev

npm config set registry https://registry.npmmirror.com/
npm config set replace-registry-host always
npm ci --no-audit --no-fund --prefer-online

npm run build

rm -rf ../public_html/*
cp -R dist/. ../public_html/

printf 'import("./app/server/dist/index.js");\n' > ../app.js
mkdir -p ../tmp
touch ../tmp/restart.txt


————————————


curl -i https://smb.aonmou.ru/

