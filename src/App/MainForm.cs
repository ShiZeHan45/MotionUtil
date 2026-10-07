using System.Drawing.Drawing2D;
using MotionVideoPipeline.Contracts;
using MotionVideoPipeline.Orchestrator;

namespace MotionVideoPipeline.App;

public sealed class MainForm : Form
{
    private static readonly Color Ink = ColorTranslator.FromHtml("#1D2939");
    private static readonly Color Muted = ColorTranslator.FromHtml("#667085");
    private static readonly Color Blue = ColorTranslator.FromHtml("#007AFF");
    private static readonly Color Surface = ColorTranslator.FromHtml("#F7F8FA");
    private readonly Label pageTitle = new();
    private readonly Label workerStatus = new();
    private readonly Panel content = new();

    public MainForm()
    {
        Text = "MotionVideoPipeline · M0";
        MinimumSize = new Size(1100, 700);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.White;
        BuildLayout();
        ShowHome();
    }

    public void ActivateFromSecondInstance(string commandLine)
    {
        WindowState = FormWindowState.Normal;
        Activate();
        if (!string.IsNullOrWhiteSpace(commandLine)) workerStatus.Text = $"已接收启动参数：{commandLine.Replace("\n", " ")}";
    }

    private void BuildLayout()
    {
        var nav = new Panel { Dock = DockStyle.Left, Width = 220, BackColor = Surface, Padding = new Padding(24, 28, 16, 24) };
        var brand = new Label { Text = "MOTION\nVIDEO PIPELINE", AutoSize = true, Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = Ink, Location = new Point(24, 24) };
        nav.Controls.Add(brand);
        var items = new[] { ("项目", (Action)ShowHome), ("流程", (Action)ShowPipeline), ("音色", (Action)ShowVoices), ("预览", (Action)ShowPreview), ("设置", (Action)ShowSettings) };
        var y = 110;
        foreach (var item in items)
        {
            var button = new Button { Text = item.Item1, FlatStyle = FlatStyle.Flat, TextAlign = ContentAlignment.MiddleLeft, Width = 176, Height = 42, Location = new Point(20, y), ForeColor = Muted, BackColor = Color.Transparent, Font = new Font("Segoe UI", 10) };
            button.FlatAppearance.BorderSize = 0;
            button.Click += (_, _) => item.Item2();
            nav.Controls.Add(button);
            y += 48;
        }

        var header = new Panel { Dock = DockStyle.Top, Height = 82, Padding = new Padding(32, 25, 32, 16), BackColor = Color.White };
        pageTitle.AutoSize = true; pageTitle.Font = new Font("Segoe UI", 20, FontStyle.Bold); pageTitle.ForeColor = Ink; header.Controls.Add(pageTitle);
        workerStatus.AutoSize = true; workerStatus.Text = "单例已锁定 · Worker 未启动"; workerStatus.ForeColor = Muted; workerStatus.Location = new Point(32, 54); header.Controls.Add(workerStatus);
        content.Dock = DockStyle.Fill; content.Padding = new Padding(32, 12, 32, 24); content.BackColor = Color.White;
        var status = new StatusStrip(); status.Items.Add(new ToolStripStatusLabel("M0 · 固定 artifacts/MotionVideoPipeline.exe")); status.Items.Add(new ToolStripStatusLabel { Spring = true }); status.Items.Add(new ToolStripStatusLabel("1080×1920 · 30fps"));
        Controls.Add(content); Controls.Add(header); Controls.Add(nav); Controls.Add(status);
    }

    private void ShowHome()
    {
        pageTitle.Text = "项目";
        content.Controls.Clear();
        var source = new Label { Text = "GitHub 周榜批量任务", AutoSize = true, Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = Ink, Location = new Point(0, 10) };
        var hint = new Label { Text = "M0 仅验证运行链路；周榜采集和批量生产将在 M1 启用。", AutoSize = true, ForeColor = Muted, Location = new Point(0, 48) };
        var url = new Label { Text = "来源  https://github.com/trending?since=weekly", AutoSize = true, ForeColor = Ink, Location = new Point(0, 108) };
        var count = new NumericUpDown { Minimum = 1, Maximum = 100, Value = 10, Width = 100, Location = new Point(0, 146) };
        var countLabel = new Label { Text = "批量数量 N", AutoSize = true, ForeColor = Muted, Location = new Point(112, 150) };
        var button = new Button { Text = "周榜批量任务 · M1 待启用", Enabled = false, Width = 230, Height = 40, Location = new Point(0, 205), BackColor = ColorTranslator.FromHtml("#E7EAF0"), FlatStyle = FlatStyle.Flat };
        content.Controls.AddRange(new Control[] { source, hint, url, count, countLabel, button });
    }

    private void ShowPipeline()
    {
        pageTitle.Text = "流程"; content.Controls.Clear();
        var stages = new[] { "EnvironmentCheckNode", "ProjectRunCreator", "VoiceCatalogPreloader", "CanvasSeedNode", "RemotionThreeRenderer", "ArtifactPublisher" };
        var y = 12;
        foreach (var stage in stages)
        {
            var line = new Label { Text = $"○  {stage}", AutoSize = true, Font = new Font("Segoe UI", 11), ForeColor = Ink, Location = new Point(0, y) };
            content.Controls.Add(line); y += 42;
        }
        workerStatus.Text = "节点队列就绪 · 当前无运行任务";
    }

    private void ShowVoices()
    {
        pageTitle.Text = "音色"; content.Controls.Clear();
        content.Controls.Add(new Label { Text = "VoiceCatalogPreloader", AutoSize = true, Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = Ink, Location = new Point(0, 10) });
        content.Controls.Add(new Label { Text = "所有显式配置音色必须在此页交互前达到 ready。试听仅读取本地 WAV 缓存。", AutoSize = true, ForeColor = Muted, Location = new Point(0, 48) });
        var grid = new DataGridView { Location = new Point(0, 100), Width = 760, Height = 260, ReadOnly = true, AllowUserToAddRows = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = Color.White };
        grid.DataSource = new[] { new { VoiceId = "zh_female_default", DisplayName = "中文女声 · Default", Language = "zh-CN", Status = "pending（环境检查后预热）" } };
        content.Controls.Add(grid);
    }

    private void ShowPreview()
    {
        pageTitle.Text = "预览"; content.Controls.Clear();
        var canvas = new Panel { Width = 324, Height = 576, Location = new Point(0, 10), BackColor = ColorTranslator.FromHtml("#F2F4F7"), BorderStyle = BorderStyle.FixedSingle };
        canvas.Paint += (_, e) => { using var pen = new Pen(ColorTranslator.FromHtml("#D0D5DD"), 1); e.Graphics.DrawRectangle(pen, 22, 48, 280, 480); e.Graphics.DrawString("CanvasWorld · M0", new Font("Segoe UI", 12), new SolidBrush(Muted), 78, 270); };
        content.Controls.Add(canvas);
        content.Controls.Add(new Label { Text = "1080×1920 · 安全区 72/1008 · 30fps · 5 秒确定性样片", AutoSize = true, ForeColor = Muted, Location = new Point(350, 28) });
    }

    private void ShowSettings()
    {
        pageTitle.Text = "设置"; content.Controls.Clear();
        content.Controls.Add(new Label { Text = "运行配置", AutoSize = true, Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = Ink, Location = new Point(0, 10) });
        content.Controls.Add(new Label { Text = "Node.js / Python / Kokoro / 模型配置采用本机路径探测；缺失时输出环境诊断，不自动下载。", AutoSize = true, ForeColor = Muted, Location = new Point(0, 48) });
        content.Controls.Add(new Label { Text = "固定发布路径", AutoSize = true, ForeColor = Ink, Location = new Point(0, 112) });
        content.Controls.Add(new Label { Text = Path.Combine(AppContext.BaseDirectory, "artifacts", "MotionVideoPipeline.exe"), AutoSize = true, ForeColor = Muted, Location = new Point(0, 140) });
    }
}
