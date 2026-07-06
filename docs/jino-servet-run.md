cd ~/domains/smb.aonmou.ru/app

git pull --ff-only origin Dev

npm config set registry https://registry.npmmirror.com/
npm config set replace-registry-host always
npm ci --no-audit --no-fund --prefer-online

grep -E 'EMAIL_NOTIFICATIONS_ENABLED|SMTP_HOST|MAX_NOTIFICATIONS_ENABLED|MAX_API_BASE_URL|MAX_RECIPIENT_ID_TYPE|MAX_CA_CERT_FILE|GOOGLE_SHEETS_NOTIFICATION_EMAILS_COLUMN|GOOGLE_SHEETS_MAX_USER_IDS_COLUMN' server/.env

npm run build

rm -rf ../public_html/*
cp -R dist/. ../public_html/

printf 'import("./app/server/dist/index.js");\n' > ../app.js
mkdir -p ../tmp
touch ../tmp/restart.txt


————————————


curl -i https://smb.aonmou.ru/
