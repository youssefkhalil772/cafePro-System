const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const desktop = path.join(process.env.USERPROFILE, 'Desktop');
const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
const batPath = path.join(__dirname, '..', 'تشغيل_النظام.bat');
const workingDir = path.join(__dirname, '..');

const vbsContent = `
Set oWS = WScript.CreateObject("WScript.Shell")

sLinkFile1 = "${desktop.replace(/\\/g, '\\\\')}\\\\CafePro POS.lnk"
Set oLink1 = oWS.CreateShortcut(sLinkFile1)
oLink1.TargetPath = "${batPath.replace(/\\/g, '\\\\')}"
oLink1.WorkingDirectory = "${workingDir.replace(/\\/g, '\\\\')}"
oLink1.Description = "CafePro POS System - نظام كافيه برو"
oLink1.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}, 0"
oLink1.Save

sLinkFile2 = "D:\\\\CafePro System\\\\CafePro POS.lnk"
Set oLink2 = oWS.CreateShortcut(sLinkFile2)
oLink2.TargetPath = "${batPath.replace(/\\/g, '\\\\')}"
oLink2.WorkingDirectory = "${workingDir.replace(/\\/g, '\\\\')}"
oLink2.Description = "CafePro POS System - نظام كافيه برو"
oLink2.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}, 0"
oLink2.Save
`;

const vbsPath = path.join(__dirname, 'create-sc.vbs');
fs.writeFileSync(vbsPath, vbsContent, 'utf8');
execSync(`cscript //nologo "${vbsPath}"`);
try { fs.unlinkSync(vbsPath); } catch (e) {}

console.log('Shortcuts successfully created with custom CafePro icon!');
