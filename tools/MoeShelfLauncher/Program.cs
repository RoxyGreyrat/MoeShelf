// MoeShelf Windows launcher (console app, .NET Framework 4.x)
// Behavior mirrors 启动.bat + launcher.js:
//   - finds a free port in 3000..3019 (override: first CLI arg)
//   - spawns: node server.js  (Node.js 18+ must be on PATH)
//   - waits for the server, then opens the default browser
// Compile (from repo root):
//   csc /nologo /target:exe /platform:anycpu /win32icon:"src\app\icon.ico" ^
//       /r:System.dll /r:System.Core.dll /out:MoeShelf.exe tools\MoeShelfLauncher\Program.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;

class MoeShelfLauncher
{
    static Process child;

    static int Main(string[] args)
    {
        Console.Title = "MoeShelf";
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        try { Environment.CurrentDirectory = dir; } catch { }

        int startPort = 3000;
        if (args.Length > 0)
        {
            int p;
            if (int.TryParse(args[0], out p) && p > 0 && p < 65536) startPort = p;
        }

        if (!File.Exists(Path.Combine(dir, "server.js")))
        {
            Console.WriteLine("[ERROR] server.js not found next to MoeShelf.exe");
            Pause();
            return 1;
        }

        int port = startPort;
        while (port < Math.Min(startPort + 20, 65535) && !IsFree(port)) port++;
        if (!IsFree(port))
        {
            Console.WriteLine("[ERROR] ports " + startPort + "-" + (startPort + 19) + " all busy.");
            Pause();
            return 1;
        }

        Console.WriteLine("MoeShelf starting on http://localhost:" + port + " ...");

        child = new Process();
        child.StartInfo.FileName = "node";
        child.StartInfo.Arguments = "server.js";
        child.StartInfo.WorkingDirectory = dir;
        child.StartInfo.UseShellExecute = false;
        child.StartInfo.EnvironmentVariables["PORT"] = port.ToString();
        child.EnableRaisingEvents = true;

        Console.CancelKeyPress += delegate(object s, ConsoleCancelEventArgs e)
        {
            e.Cancel = true;
            KillChild();
        };

        try
        {
            child.Start();
        }
        catch (Exception ex)
        {
            Console.WriteLine("[ERROR] cannot start node: " + ex.Message);
            Console.WriteLine("Install Node.js 18+ and make sure it is on PATH (node --version).");
            Pause();
            return 1;
        }

        string url = "http://localhost:" + port;
        if (WaitConnect(port, 30000))
        {
            Console.WriteLine("URL: " + url);
            if (Environment.GetEnvironmentVariable("MOESHELF_NO_BROWSER") != "1")
            {
                try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
                catch { }
            }
        }
        else
        {
            Console.WriteLine("[ERROR] server did not respond in time. Check node version / antivirus.");
        }

        child.WaitForExit();
        KillChild();
        Console.WriteLine("Server stopped (exit code " + child.ExitCode + ").");
        Pause();
        return child.ExitCode;
    }

    static bool IsFree(int port)
    {
        try
        {
            TcpListener l = new TcpListener(IPAddress.Any, port);
            l.Start();
            l.Stop();
            return true;
        }
        catch { return false; }
    }

    static bool WaitConnect(int port, int timeoutMs)
    {
        long deadline = Environment.TickCount + timeoutMs;
        while (Environment.TickCount < deadline)
        {
            try
            {
                using (TcpClient c = new TcpClient())
                {
                    IAsyncResult r = c.BeginConnect(IPAddress.Loopback, port, null, null);
                    if (r.AsyncWaitHandle.WaitOne(400)) { c.EndConnect(r); return true; }
                }
            }
            catch { }
            Thread.Sleep(300);
        }
        return false;
    }

    static void KillChild()
    {
        try { if (child != null && !child.HasExited) child.Kill(); } catch { }
    }

    static void Pause()
    {
        if (Environment.GetEnvironmentVariable("MOESHELF_NOPAUSE") == "1") return;
        try { Console.WriteLine("Press Enter to close..."); Console.ReadLine(); } catch { }
    }
}
