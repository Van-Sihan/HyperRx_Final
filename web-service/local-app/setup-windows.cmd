@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "KDB=kdb-v1.0.2-20261105"
rem HyperRx(이전 이름 갤藥시) Windows 준비: Node.js·Python 확인, 가상환경과 패키지 설치, Hyper-RAG 엔진 패치, DB 압축 풀기, .env 생성.
rem 상위 폴더에 kdb-v1.0.2-20261105.zip 과 .zip.md5 가 있어야 합니다. 여러 번 실행해도 됩니다.
rem 이전 판으로 준비한 DB 폴더는 판 이름이 다르면 다시 검사하고, 바뀐 파일만 새로 풉니다.

echo [1/6] Node.js 확인
where node >nul 2>nul || (echo Node.js 22.9 이상이 필요합니다. https://nodejs.org 에서 LTS를 설치한 뒤 다시 실행하세요.& goto :fail)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=9)?0:1)" || (echo Node.js 22.9 이상이 필요합니다. 현재 버전:& node --version& goto :fail)

echo [2/6] Python 확인
set "PY="
py -3 -c "import sys;sys.exit(0 if sys.version_info>=(3,11) else 1)" >nul 2>nul && set "PY=py -3"
if not defined PY python -c "import sys;sys.exit(0 if sys.version_info>=(3,11) else 1)" >nul 2>nul && set "PY=python"
if not defined PY (echo Python 3.11 이상이 필요합니다. https://www.python.org 에서 설치할 때 Add python.exe to PATH 를 체크하세요.& goto :fail)

echo [3/6] Python 가상환경과 패키지 설치 - 처음에는 몇 분 걸립니다
if not exist ".venv\Scripts\python.exe" %PY% -m venv .venv || goto :fail
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt || goto :fail

echo [4/6] Hyper-RAG 엔진 확인
if not exist "vendor\Hyper-RAG\hyperrag\operate.py" (
  where git >nul 2>nul || (echo vendor\Hyper-RAG 폴더가 없고 git도 없습니다.& goto :fail)
  git clone https://github.com/iMoonLab/Hyper-RAG.git vendor\Hyper-RAG || goto :fail
  git -C vendor\Hyper-RAG checkout 46ff126225720a145546fa012e0abbba491b9ab3 || goto :fail
)
".venv\Scripts\python.exe" patch_engine.py || goto :fail

echo [5/6] DB 검사와 압축 풀기 - 상위 폴더의 %KDB%.zip
if not exist "..\%KDB%.zip" (echo 상위 폴더에 %KDB%.zip 이 없습니다.& goto :fail)
if not exist "..\%KDB%.zip.md5" (echo 상위 폴더에 %KDB%.zip.md5 가 없습니다.& goto :fail)
findstr /c:"%KDB%" "data\kdb-work\verified.json" >nul 2>nul && (echo 이미 준비됨: data\kdb-work, %KDB%) || (".venv\Scripts\python.exe" -X utf8 prepare_db.py || goto :fail)

echo [6/6] 설정 파일 .env
if not exist ".env" copy ".env.example" ".env" >nul
findstr /r /c:"^OPENAI_API_KEY=..*" ".env" >nul && (echo API 키 확인됨) || (echo .env 의 OPENAI_API_KEY= 뒤에 팀 키를 붙여 넣고 저장하세요. 메모장을 엽니다.& start "" notepad ".env")

echo.
echo 준비 완료. 키를 저장한 뒤 상위 폴더의 start-web.cmd 를 더블클릭하세요.
pause
exit /b 0

:fail
echo.
echo 준비를 마치지 못했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
