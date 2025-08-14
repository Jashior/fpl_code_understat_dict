@echo OFF
echo "Running dict.js and updating git..."
cd /D C:\Dev\Projects\2023\fpl_code_understat_dict
node dict.js >> dict.log 2>&1
git add .
git commit -m "update dict"
git push
echo "Done."