// HyperRx portable launcher: starts the DB search server (Python) and the web server (Node),
// opens the browser, and stops both when this window closes.
// Build: csc /target:exe /win32icon:HyperRx.ico /out:HyperRx.exe HyperRx.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class HyperRxLauncher
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr CreateJobObject(IntPtr attrs, string name);
    [DllImport("kernel32.dll")]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll")]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [StructLayout(LayoutKind.Sequential)]
    struct IO_COUNTERS { public ulong R, W, O, RB, WB, OB; }
    [StructLayout(LayoutKind.Sequential)]
    struct BASIC_LIMITS
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct EXTENDED_LIMITS
    {
        public BASIC_LIMITS Basic;
        public IO_COUNTERS Io;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }

    static IntPtr job = IntPtr.Zero;

    // Every child joins a job that Windows closes with this process, so no server is left running.
    static void MakeJob()
    {
        job = CreateJobObject(IntPtr.Zero, null);
        EXTENDED_LIMITS info = new EXTENDED_LIMITS();
        info.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        int len = Marshal.SizeOf(typeof(EXTENDED_LIMITS));
        IntPtr p = Marshal.AllocHGlobal(len);
        Marshal.StructureToPtr(info, p, false);
        SetInformationJobObject(job, 9, p, (uint)len);
        Marshal.FreeHGlobal(p);
    }

    static void Say(string text) { Console.WriteLine(text); }

    static void Fail(string text)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Say("");
        Say(text);
        Console.ResetColor();
        Say("");
        Say("Enter 키를 누르면 창이 닫힙니다.");
        Console.ReadLine();
        Environment.Exit(1);
    }

    static string Get(string url, int timeoutMs)
    {
        try
        {
            HttpWebRequest r = (HttpWebRequest)WebRequest.Create(url);
            r.Timeout = timeoutMs;
            r.ReadWriteTimeout = timeoutMs;
            r.Proxy = null;
            using (HttpWebResponse res = (HttpWebResponse)r.GetResponse())
            using (StreamReader sr = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
            {
                if ((int)res.StatusCode != 200) return null;
                return sr.ReadToEnd();
            }
        }
        catch { return null; }
    }

    static Dictionary<string, string> ReadEnv(string path)
    {
        Dictionary<string, string> d = new Dictionary<string, string>();
        if (!File.Exists(path)) return d;
        foreach (string raw in File.ReadAllLines(path, Encoding.UTF8))
        {
            string line = raw.Trim();
            if (line.Length == 0 || line.StartsWith("#")) continue;
            int i = line.IndexOf('=');
            if (i > 0) d[line.Substring(0, i).Trim()] = line.Substring(i + 1).Trim();
        }
        return d;
    }

    static Process Start(string exe, string args, string cwd)
    {
        ProcessStartInfo si = new ProcessStartInfo(exe, args);
        si.WorkingDirectory = cwd;
        si.UseShellExecute = false;
        // A Python or Node setting on the other computer must not change these bundled runtimes.
        foreach (string k in new string[] { "PYTHONHOME", "PYTHONPATH", "PYTHONSTARTUP", "NODE_OPTIONS", "NODE_PATH" })
            si.EnvironmentVariables.Remove(k);
        si.EnvironmentVariables["PYTHONNOUSERSITE"] = "1";
        si.EnvironmentVariables["PYTHONUTF8"] = "1";
        si.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
        Process p = Process.Start(si);
        if (job != IntPtr.Zero) AssignProcessToJobObject(job, p.Handle);
        return p;
    }

    static void OpenBrowser(string url)
    {
        if (noBrowser) return;
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch { Say("브라우저를 열지 못했습니다. 주소창에 직접 입력하세요: " + url); }
    }

    static bool noBrowser = false;

    static int Main(string[] args)
    {
        noBrowser = Array.IndexOf(args, "--no-browser") >= 0; // for testing
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "HyperRx";
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string app = Path.Combine(root, "app");
        string node = Path.Combine(root, @"runtime\node\node.exe");
        string py = Path.Combine(root, @"runtime\python\python.exe");

        Say("HyperRx 로컬 서비스");
        Say("------------------------------------------------------------");
        foreach (string f in new string[] { node, py, Path.Combine(app, "server.mjs"), Path.Combine(app, "db_server.py"),
                                            Path.Combine(app, @"data\kdb-work\verified.json") })
            if (!File.Exists(f)) Fail("필요한 파일이 없습니다: " + f + "\nZIP을 모두 푼 폴더에서 HyperRx.exe를 실행하세요.");

        Dictionary<string, string> env = ReadEnv(Path.Combine(app, ".env"));
        string port = env.ContainsKey("PORT") && env["PORT"].Length > 0 ? env["PORT"] : "8787";
        string home = "http://127.0.0.1:" + port + "/";
        const string db = "http://127.0.0.1:8788/health";

        string status = Get(home + "api/status", 1500);
        if (status != null && status.Contains("galyaksi-local"))
        {
            Say("이미 실행 중입니다. 브라우저를 엽니다: " + home);
            OpenBrowser(home);
            Thread.Sleep(2500);
            return 0;
        }
        if (status != null || Get(home, 1500) != null)
            Fail(port + "번 포트를 다른 프로그램이 쓰고 있습니다. 그 프로그램을 끄거나 app\\.env의 PORT를 바꾸세요.");

        MakeJob();
        Process dbProc = null;
        if (Get(db, 1500) == null)
        {
            Say("1/2  DB 검색 서버를 시작합니다. 처음 몇 초에서 30초 정도 걸립니다 (메모리 약 3GB 사용).");
            dbProc = Start(py, "-X utf8 db_server.py", app);
            bool ok = false;
            for (int i = 0; i < 300 && !ok; i++)
            {
                if (dbProc.HasExited) Fail("DB 검색 서버가 시작하지 못했습니다. 위의 오류 내용을 확인하세요. 8788번 포트를 다른 프로그램이 쓰고 있을 수도 있습니다.");
                ok = Get(db, 1000) != null;
                if (!ok) Thread.Sleep(1000);
            }
            if (!ok) Fail("DB 검색 서버가 5분 안에 준비되지 않았습니다.");
        }
        else Say("1/2  DB 검색 서버가 이미 실행 중이라 그대로 씁니다.");

        Say("2/2  웹 서버를 시작합니다.");
        Process web = Start(node, "--env-file-if-exists=.env server.mjs", app);
        bool webOk = false;
        for (int i = 0; i < 60 && !webOk; i++)
        {
            if (web.HasExited) Fail("웹 서버가 시작하지 못했습니다. 위의 오류 내용을 확인하세요.");
            string s = Get(home + "api/status", 1000);
            webOk = s != null && s.Contains("galyaksi-local");
            if (!webOk) Thread.Sleep(500);
        }
        if (!webOk) Fail("웹 서버가 30초 안에 준비되지 않았습니다.");

        Console.ForegroundColor = ConsoleColor.Green;
        Say("");
        Say("HyperRx 준비 완료: " + home);
        Console.ResetColor();
        Say("- 브라우저가 자동으로 열립니다. 실제 답변을 받으려면 왼쪽 아래 설정(톱니바퀴)에 OpenAI API 키를 넣으세요.");
        Say("- 이 창을 닫으면 HyperRx가 종료됩니다. 쓰는 동안에는 닫지 마세요.");
        Say("------------------------------------------------------------");
        OpenBrowser(home);
        web.WaitForExit();
        if (dbProc != null && !dbProc.HasExited) { try { dbProc.Kill(); } catch { } }
        return 0;
    }
}
