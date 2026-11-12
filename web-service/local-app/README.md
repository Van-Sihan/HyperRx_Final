# HyperRx 서비스 소스코드 (개발자용)

HyperRx 웹 서버(Node.js)와 DB 검색 서버(Python, Hyper-RAG)의 소스입니다. 서비스 소개와 화면 사용법은 저장소 맨 위의 [README](../../README.md)를 보세요.

| 구성 | 파일 | 포트 |
|---|---|---|
| 웹 서버 | `server.mjs`(요청 처리), `service.mjs`(답변 생성), `launch.mjs`(두 서버 실행) | 8787 |
| DB 검색 서버 | `db_server.py`(Hyper-RAG 검색), `clinical.py`(DUR·허가사항 규칙 조회), `evidence.py`(원문·출처) | 8788 |
| 화면 | `src/`(코드), `public/`(HTML·CSS·시연용 답변), `build.mjs`(esbuild 빌드) | |
| 테스트 | `tests/` | |

## 처음 실행

Node.js 22.9 이상과 npm이 필요합니다. 이 폴더에서 실행하세요.

```powershell
npm ci
npm run build
npm start
```

서버 준비가 끝나면 **http://127.0.0.1:8787/** 에서 질문 화면이 열립니다. 이미 서버가 실행 중이면 같은 서버의 화면을 엽니다.

Windows에서는 이 폴더의 `start-local.cmd`를 더블클릭해도 됩니다. 처음 설치·빌드는 위 명령으로 먼저 진행하세요. 브라우저 없이 서버만 실행할 때는 `npm run start:server`를 사용합니다. 종료는 실행 터미널에서 Ctrl+C입니다.

`.env` 없이 실행하면 API 호출이 없는 가상 데이터 체험이 가능합니다. 실제 팀 DB와 API 키는 저장소에 포함하지 않습니다.

## 실제 연결 준비 (Windows)

한 번에 준비하려면 `setup-windows.cmd`를 실행하세요. Node.js·Python 확인, 가상환경과 패키지 설치, Hyper-RAG 엔진 받기와 패치, DB 검사와 압축 풀기, `.env` 생성까지 차례로 진행합니다. 아래는 같은 과정을 직접 실행하는 명령입니다.

Python 3.11 이상을 사용하세요. 이 PC에서는 Python 3.13으로 검증했습니다.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
git clone https://github.com/iMoonLab/Hyper-RAG.git vendor/Hyper-RAG
git -C vendor/Hyper-RAG checkout 46ff126225720a145546fa012e0abbba491b9ab3
.venv\Scripts\python.exe patch_engine.py
```

저장소 Releases에서 내려받은 `kdb-v1.0.2-20261105.zip`과 `.zip.md5`를 이 폴더의 상위 폴더(`web-service/`)에 놓고 실행합니다.

```powershell
.venv\Scripts\python.exe prepare_db.py
Copy-Item .env.example .env
```

이미 `.env`가 있으면 복사 명령을 실행하지 말고 기존 파일을 사용하세요. `.env`의 `OPENAI_API_KEY`에 키를 입력하거나, 화면의 설정에서 키를 넣습니다. 키를 GitHub 또는 채팅에 올리지 마세요. 예제 파일의 `HYPERRAG_URL=http://127.0.0.1:8788`과 DB 버전을 유지한 뒤 `npm start`를 실행합니다. 설정 변경 후에는 서버를 재시작하세요.

노드를 누르면 나오는 사전은 약의 허가정보를 의약품안전나라(식품의약품안전처)에서 가져와 보여 줍니다. 의약품안전나라 사이트는 자동 수집을 막고 있어서(`robots.txt`), 같은 허가정보를 주는 공공데이터포털 '식품의약품안전처_의약품 제품 허가정보' 서비스를 씁니다. 이 서비스의 일반 인증키를 `.env`의 `MFDS_API_KEY`에 넣으세요. 키가 없으면 사전은 HyperRx 요약을 보여 줍니다. 받은 허가정보는 `data/mfds-label-cache`에 14일 동안 보관하며, 키는 저장하지 않습니다.

`prepare_db.py`는 ZIP 및 내부 파일 MD5를 검사하고 `data/kdb-work`에 작업 복사본을 만듭니다. 원본 ZIP은 유지됩니다. DB(v1.0.2)는 문서/청크 13,522건, 개체 47,122개, 하이퍼엣지 101,692개입니다. 시작 시 수 GB의 메모리와 약 10~20초가 필요합니다.

## 하이퍼엣지와 출처

[원저자 backend/db.py](https://github.com/iMoonLab/Hyper-RAG/blob/main/web-ui/backend/db.py)의 `get_hyperedge_detail`은 구성원 집합으로 저장 관계를 조회합니다. 로컬도 실제 저장된 관계의 `source_id`만 청크·출처대조표에 연결합니다. 검색 문서와 비슷하다는 이유로 출처를 추정하지 않습니다.

관계 선택 시 해당 구성원을 확대하고 다음 정보를 제공합니다.

- 원문 → DB 추출·병합 → 구성 개체 경로와 실제 출처 제목.
- DB에 저장된 관계 설명·태그, 원문 자료 분류, 연결된 개체.
- 개체별 동일 표기가 등장하는 원문 발췌 및 문자 위치. 별칭·번역은 추정하지 않고 대조 필요로 표시.
- 원문 인용과 저장된 청크 전체 보기. PMID가 기록된 논문에는 PubMed 링크 제공. 외부 주소는 추측하지 않음.
- 일부 출처가 누락되거나 전부 없으면 명시. DB 가중치는 임상 위험도나 신뢰도 점수가 아님.

관계 설명과 태그는 자동 추출 결과입니다. 원문 연결 및 동일 표기 일치는 문장 의미나 임상적 정확성을 검증했다는 뜻이 아닙니다. 원문 전체 보기는 저장된 청크 전체이며 원자료 전체 문서와 다를 수 있습니다. 답변 생성에도 반환 관계가 실제 참조하는 원문 발췌와 ID를 전달합니다. 검색 문서와 관계 원문에는 S1, S2 … 번호를 붙여 모델에 전달하고, 모델은 문장마다 근거 번호를 적습니다. 서버는 그 번호가 실제로 제공한 자료인지만 확인합니다. 번호가 가리키는 원문이 문장 내용을 실제로 지지하는지는 자동 검증하지 않습니다.

## 약명 검색 보완

DUR 내부 ID 대신 실제 성분명·분류를 제목으로 표시합니다. 제품 자료는 제품명, 논문은 본문 제목을 사용합니다. 내부 ID는 접힌 상세 정보에 보존합니다.

질문에서 알려진 약명을 인식하면 직접 언급된 문서를 보충하고 무관한 후보를 제외합니다. 생성 문맥도 함께 교체합니다. 별칭을 새로 추정하지 않으며 인식하지 못한 질문에는 원래 검색을 적용합니다. 팀의 한영 키워드 프롬프트 2판, top_k 60, 임베딩 text-embedding-3-small / 1,536차원을 사용합니다.

질문에서 약이 2개 이상 인식되면, 그 약들이 함께 든 하이퍼엣지를 DB에서 직접 찾아 앞에 보탭니다(최대 20개, `added_by: "question-drug-pair"`, `retrieval.added_pair_hyperedges`). 원코드는 하이퍼엣지를 구성원 수가 많은 순으로 정렬한 뒤 관계 예산(1,600토큰)에서 잘라서, (심바스타틴, 클래리트로마이신) 같은 짧은 DUR 규칙 관계가 빠지기 때문입니다. 약 이름은 별칭, 괄호 표기, 염·수화물 형태까지 같은 약으로 보고, "○○ 장기복용 환자" 같은 개체는 제외합니다. API 호출은 없습니다.

## 검증

```powershell
npm test
.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -p "test_*.py"
```

서버와 팀 DB가 실행 중일 때 `node tests/http-check.mjs`로 경로·요청 검증·실제 원문 조회를 확인합니다. `tests/live-check.mjs`는 실제 API를 사용하는 별도 점검이며 일반 테스트에는 포함하지 않습니다.

서버는 웹 8787, DB 8788 포트의 `127.0.0.1`에만 바인딩합니다(컨테이너 안의 웹 서버만 `BIND_HOST=0.0.0.0`). 현재 개발 상태는 로컬 연구용이며, 공유 운영에는 인증·저장·데이터 및 출처 검토가 추가로 필요합니다.

## API 키

화면 왼쪽 아래 설정(톱니바퀴)의 **API 키**에 사용자가 자기 키를 넣을 수 있습니다. 입력칸 아래에 키를 만드는 방법과 보관 방식이 나옵니다.

| 키 | 필요 여부 | 쓰는 곳 | 비용 |
|---|---|---|---|
| OpenAI API 키 (`sk-`로 시작) | 실제 답변에 필수 | 검색어 추출·임베딩(DB 서버), 답변 생성(웹 서버) | 질문 하나에 약 $0.004(1·2제, RAG)~$0.013(3제 이상, HyperRAG), gpt-4o-mini |
| 공공데이터포털 일반 인증키 | 선택 | 노드 사전의 의약품안전나라 허가정보 | 무료 |

비용은 2026-11-12 Docker에서 2제 질문(RAG)과 3제 질문(HyperRAG)을 한 번씩 실행해 잰 값입니다. 답변 생성에 들어간 입력은 2제 약 2.2만 토큰, 3제 약 7.9만 토큰이었고, 검색어 추출과 임베딩은 두 질문을 합쳐 $0.001 미만이었습니다. 3제 질문은 답변 모델에 넘기는 검색 결과(원문·개체·관계)가 많아 비용이 큽니다. 답변마다 검색 결과가 달라서 실제 비용은 조금씩 다를 수 있습니다.

- 키는 브라우저에만 저장됩니다. 기본은 sessionStorage(탭을 닫으면 지워짐)이고, "이 브라우저에 기억하기"를 켜면 localStorage에 남습니다.
- 질문할 때 `X-OpenAI-Key`, 허가정보를 불러올 때 `X-MFDS-Key` 요청 헤더로만 보냅니다. URL에는 넣지 않습니다. 서버는 그 요청을 처리하는 동안만 쓰고 저장·기록·응답하지 않습니다.
- 어떤 키를 쓰는지: 요청에 사용자 키가 있으면 그 키를 씁니다. 없으면 `.env`의 키를 씁니다. 단 `REQUIRE_USER_KEY=1`이면 서버의 `OPENAI_API_KEY`는 쓰지 않습니다(공개 서버에서 운영자 비용이 나가지 않게 함). 공공데이터포털 키는 무료라서, 사용자가 넣지 않으면 서버의 `MFDS_API_KEY`를 씁니다.
- 받은 허가정보는 공개 자료이므로 `data/mfds-label-cache`에 키 없이 14일 동안 보관하고, 다른 사용자에게도 같은 결과를 보여 줍니다.

## Docker로 배포

`Dockerfile` 하나로 웹 서버(Node 22)와 DB 검색 서버(Python 3.13, Hyper-RAG)를 한 컨테이너에서 실행합니다. 이미지에는 API 키와 팀 DB가 들어가지 않습니다. 팀 DB는 처음 시작할 때 볼륨에 풀고, 컨테이너는 `REQUIRE_USER_KEY=1`로 시작해 사용자마다 자기 OpenAI 키를 넣어야 실제 답변이 나옵니다.

준비물

- Docker Engine 23 이상과 Docker Compose v2 (빌드 제외 목록 `Dockerfile.dockerignore`를 읽는 BuildKit이 필요합니다)
- 메모리 4GB 이상(8GB 권장). 이 PC에서 DB 서버는 실행 중 약 2.3GB를 씁니다. 디스크는 이미지와 DB를 합쳐 약 5GB가 필요합니다.
- `kdb-v1.0.2-20261105.zip`과 `.zip.md5`를 이 폴더의 상위 폴더(`web-service/`)에 둡니다. 로컬 준비와 같은 위치입니다.
- 노드 사전에 의약품안전나라 허가정보를 보여 주려면 이 폴더의 `.env`에 `MFDS_API_KEY=공공데이터포털 일반 인증키` 한 줄을 둡니다. compose가 이 한 줄만 컨테이너에 넘기며, `.env`는 git과 이미지에 들어가지 않습니다. 이 키가 없으면 사용자가 설정에 자기 키를 넣지 않는 한 사전은 HyperRx 요약을 보여 줍니다.

실행 (이 폴더에서)

```bash
docker compose up -d --build
docker compose logs -f
```

처음 시작하면 ZIP을 검사해 `hyperrx-db` 볼륨에 풀기 때문에 몇 분이 걸립니다. 로그에 `HyperRx ready`가 나오면 이 컴퓨터에서 http://127.0.0.1:8787/ 을 엽니다. 다음 시작부터는 압축 풀기를 건너뜁니다. DB 판이 바뀌면 `docker compose run --rm hyperrx .venv/bin/python prepare_db.py`로 다시 풉니다.

다른 사람이 쓰게 하려면

1. 서버(클라우드 VM 등)에 위와 같이 실행합니다. compose는 포트를 `127.0.0.1`에만 엽니다.
2. 같은 서버에 HTTPS 프록시를 둡니다. 키가 요청 헤더로 오가므로 HTTP로 공개하지 마세요. Caddy를 쓰면 `Caddyfile`에 아래 두 줄만 적어도 인증서를 자동으로 받습니다.

   ```
   hyperrx.example.org {
       reverse_proxy 127.0.0.1:8787
   }
   ```

3. `docker-compose.yml`의 `ALLOWED_HOSTS`에 공개 주소(예: `hyperrx.example.org`)를 적고 `docker compose up -d`로 다시 시작합니다. 목록에 없는 주소로 들어온 요청은 거절합니다.

운영 전에 확인할 점

- 검색은 한 번에 하나씩 처리합니다(DB 서버의 잠금). 동시에 여러 사람이 질문하면 차례를 기다립니다.
- 로그인 기능이 없어서 주소를 아는 사람은 누구나 씁니다. 비용은 각자 키로 나가지만, 서버 자원은 운영자가 부담합니다.
- DB에는 PubMed 논문 초록 239건이 들어 있습니다. 공개 서비스에서 초록 원문을 보여 줘도 되는지 출판사 이용 조건을 먼저 확인하세요.
- 빌드와 실행은 Windows 11, Docker Desktop 4.99(Engine 29.9)에서 확인했습니다.

## 공유하지 않는 파일

`.env`, `.venv`, `node_modules`, `data`, `vendor`, DB ZIP, 실행 로그는 저장소에 넣지 않습니다. 프런트 생성물은 `npm run build`로 만듭니다. 원저자 엔진은 위 고정 커밋을 별도 설치하며 귀속은 `THIRD_PARTY_NOTICES.md` 및 `licenses/Hyper-RAG-LICENSE`에 기록되어 있습니다.
