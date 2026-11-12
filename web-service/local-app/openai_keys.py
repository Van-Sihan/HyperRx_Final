"""Whose OpenAI key a search uses, and what a failed OpenAI call means to the reader. No key is logged or returned.

A request may carry the reader's own key (X-OpenAI-Key). Without one the server's .env key is used, unless
REQUIRE_USER_KEY=1 (a public server, where each reader pays for their own questions)."""
import os,re,asyncio,functools
KEY_FORMAT=re.compile(r'sk-[A-Za-z0-9_\-]{20,300}')
def require_user_key():
 return os.getenv('REQUIRE_USER_KEY','').strip().lower() in ('1','true','yes')
def server_key():
 return None if require_user_key() else (os.getenv('OPENAI_API_KEY') or None)
def limit_calls(max_size,waitting_time=0.0001):
 """Hyper-RAG's limit_async_func_call with the slot given back when a call fails. The original keeps the slot of a
 failed call, so after 16 failures (a wrong key, a used-up quota, a timeout) every later search waited forever."""
 def wrap(func):
  current=0
  @functools.wraps(func)
  async def call(*args,**kwargs):
   nonlocal current
   while current>=max_size:await asyncio.sleep(waitting_time)
   current+=1
   try:return await func(*args,**kwargs)
   finally:current-=1
  return call
 return wrap
MESSAGES={
 401:'OpenAI API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.',
 403:'이 OpenAI API 키로는 검색에 쓰는 모델을 사용할 수 없습니다. 키의 권한과 프로젝트 설정을 확인해 주세요.',
 429:'OpenAI 사용 한도를 넘었거나 결제 잔액이 부족합니다. OpenAI 계정의 Billing과 Limits를 확인해 주세요.',
}
def status_of(error):
 """The HTTP status of the OpenAI error behind a failed search, looking through wrapping exceptions; None when unknown."""
 seen=0
 while error is not None and seen<8:
  status=getattr(error,'status_code',None)
  if isinstance(status,int):return status
  error=error.__cause__ or error.__context__;seen+=1
 return None
def failure(error):
 """(status, message) for the reader. Key, permission and quota problems keep their meaning; anything else is 502."""
 status=status_of(error)
 if status in MESSAGES:return status,MESSAGES[status]
 return 502,'검색 호출에 실패했습니다. OpenAI 연결·사용 한도와 서버 상태를 확인해 주세요.'
