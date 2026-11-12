import os,asyncio,unittest
import httpx,openai
import openai_keys

def api_error(cls,status):
 request=httpx.Request('POST','https://api.openai.com/v1/embeddings')
 return cls('Incorrect API key provided: sk-abc***wxyz',response=httpx.Response(status,request=request),body=None)

class Keys(unittest.TestCase):
 def setUp(self):
  self.saved={k:os.environ.get(k) for k in ('REQUIRE_USER_KEY','OPENAI_API_KEY')}
 def tearDown(self):
  for k,v in self.saved.items():
   if v is None:os.environ.pop(k,None)
   else:os.environ[k]=v
 def test_server_key_is_not_used_when_readers_bring_their_own(self):
  os.environ['OPENAI_API_KEY']='sk-'+'a'*40
  os.environ.pop('REQUIRE_USER_KEY',None);self.assertEqual(openai_keys.server_key(),'sk-'+'a'*40)
  os.environ['REQUIRE_USER_KEY']='1';self.assertIsNone(openai_keys.server_key())
  os.environ['REQUIRE_USER_KEY']='true';self.assertTrue(openai_keys.require_user_key())
 def test_key_form(self):
  ok=openai_keys.KEY_FORMAT.fullmatch
  self.assertTrue(ok('sk-proj-'+'Ab9_-'*30))
  for bad in ('','sk-short','pk-'+'a'*40,'sk-'+'a'*20+' b','sk-'+'a'*40+'\n'):self.assertIsNone(ok(bad))
 def test_a_failed_search_tells_what_went_wrong_without_the_key(self):
  for cls,status in ((openai.AuthenticationError,401),(openai.PermissionDeniedError,403),(openai.RateLimitError,429)):
   code,message=openai_keys.failure(api_error(cls,status))
   self.assertEqual(code,status);self.assertNotIn('sk-',message)
  # The engine may raise its own error from the OpenAI one.
  try:
   try:raise api_error(openai.AuthenticationError,401)
   except Exception as e:raise RuntimeError('engine failed') from e
  except RuntimeError as wrapped:self.assertEqual(openai_keys.failure(wrapped)[0],401)
  self.assertEqual(openai_keys.failure(asyncio.TimeoutError())[0],502)

class Limiter(unittest.TestCase):
 def test_a_failed_call_gives_its_slot_back(self):
  # Hyper-RAG's own limiter kept the slot of every failed call: after max_size wrong-key searches nothing ran again.
  async def run():
   calls=0
   @openai_keys.limit_calls(2)
   async def call(fail):
    nonlocal calls;calls+=1
    if fail:raise ValueError('wrong key')
    return 'ok'
   for _ in range(5):
    with self.assertRaises(ValueError):await call(True)
   self.assertEqual(await asyncio.wait_for(call(False),timeout=1),'ok')
   return calls
  self.assertEqual(asyncio.run(run()),6)
 def test_it_still_limits_how_many_run_at_once(self):
  async def run():
   running=peak=0
   @openai_keys.limit_calls(2)
   async def call():
    nonlocal running,peak;running+=1;peak=max(peak,running);await asyncio.sleep(.01);running-=1
   await asyncio.gather(*(call() for _ in range(6)))
   return peak
  self.assertEqual(asyncio.run(run()),2)

if __name__=='__main__':unittest.main()
