using System.Diagnostics;
using System.Globalization;
using System.Media;
using System.Text.Json;
using GitHubTrendingVideo.Models;
using GitHubTrendingVideo.Services;

namespace GitHubTrendingVideo;

public sealed class MainForm : Form
{
    private readonly RuntimePaths _paths = new();
    private readonly ProcessRunner _processes = new();
    private readonly SettingsStore _settingsStore;
    private readonly EnvironmentService _environment;
    private readonly PipelineService _pipeline;
    private AppSettings _settings;
    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };
    private readonly FlowLayoutPanel _nodeList = new() { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(18, 14, 18, 14) };
    private readonly Dictionary<int, NodeCard> _cards = [];
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, Dock = DockStyle.Fill, BackColor = Color.FromArgb(22, 27, 34), ForeColor = Color.FromArgb(225, 232, 240), Font = new Font("Consolas", 9.5f) };
    private readonly Label _runLabel = new() { AutoSize = false, Width = 150, Height = 24, AutoEllipsis = true, Text = "尚未开始运行", ForeColor = Color.FromArgb(93, 173, 226), Font = new Font("Microsoft YaHei UI", 10, FontStyle.Bold) };
    private readonly Label _overallLabel = new() { AutoSize = true, Text = "整体进度 0/5" };
    private readonly Label _overallEtaLabel = new() { AutoSize = false, Width = 150, Height = 24, AutoEllipsis = true, Text = "预计剩余 正在估算…", ForeColor = Color.FromArgb(71, 85, 105) };
    private readonly ProgressBar _overallProgress = new() { Width = 220, Height = 16, Maximum = 5, Style = ProgressBarStyle.Continuous };
    private readonly Label _projectLabel = new() { AutoEllipsis = true, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
    private readonly Label _environmentSummary = new() { AutoSize = true, Text = "正在检查环境…", ForeColor = Color.DimGray };
    private readonly FlowLayoutPanel _environmentList = new() { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(18, 14, 18, 14) };
    private readonly Dictionary<string, EnvironmentCard> _environmentCards = [];
    private readonly Dictionary<string, TextBox> _settingBoxes = [];
    private readonly ComboBox _deviceBox = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 150 };
    private readonly ComboBox _voiceBox = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 210, IntegralHeight = false, MaxDropDownItems = 18 };
    private readonly NumericUpDown _speedBox = new() { Minimum = 0.1m, Maximum = 3m, DecimalPlaces = 2, Increment = 0.05m, Width = 150 };
    private readonly NumericUpDown _topNBox = new() { Minimum = 1, Maximum = 20, DecimalPlaces = 0, Increment = 1, Width = 150 };
    private readonly Label _outputLabel = new() { AutoEllipsis = true, Dock = DockStyle.Fill };
    private Button? _resumeButton;
    private CancellationTokenSource? _runCancellation;
    private CancellationTokenSource? _previewCancellation;
    private CancellationTokenSource? _voiceWarmupCancellation;
    private Task? _voiceWarmupTask;
    private SoundPlayer? _previewPlayer;
    private Button? _previewVoiceButton;
    private Label? _voiceStatusLabel;
    private VoiceCacheIndicator? _voiceCacheProgress;
    private bool _changingVoiceForPreview;
    private readonly System.Windows.Forms.Timer _etaTimer = new() { Interval = 1000 };
    private readonly DateTimeOffset?[] _nodeStartedAt = new DateTimeOffset?[5];
    private readonly Dictionary<int, double> _nodeDurationsSeconds = [];
    private readonly bool[] _nodeCompleted = new bool[5];
    private int _activeNodeIndex = -1;
    private int _activeNodeProgress;
    private string _activeNodeStatus = "等待中";
    private int _completedNodeCount;
    private bool _busy;

    public MainForm()
    {
        _settingsStore = new SettingsStore(_paths);
        _settings = LoadSettingsSafely();
        _environment = new EnvironmentService(_paths, _processes);
        _pipeline = new PipelineService(_paths, _processes, _environment);
        Text = "GitHub Trending Video · 桌面工作台";
        MinimumSize = new Size(960, 680);
        var workArea = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 800);
        Size = new Size(Math.Min(1240, Math.Max(MinimumSize.Width, workArea.Width - 24)), Math.Min(820, Math.Max(MinimumSize.Height, workArea.Height - 24)));
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft YaHei UI", 9.5f);
        BackColor = Color.FromArgb(245, 247, 250);
        BuildUi();
        WireEvents();
        _etaTimer.Tick += (_, _) => UpdateEtaDisplay();
        FormClosed += (_, _) => { _etaTimer.Dispose(); StopVoicePreview(); StopVoicePreviewWarmup(); };
        Shown += async (_, _) => await RefreshAllAsync();
        _tabs.SelectedIndexChanged += (_, _) =>
        {
            if (_tabs.SelectedIndex == 2) StartVoicePreviewWarmup();
        };
    }

    private AppSettings LoadSettingsSafely()
    {
        try { return _settingsStore.Load(); }
        catch (Exception error) { MessageBox.Show(error.Message, "设置读取失败", MessageBoxButtons.OK, MessageBoxIcon.Warning); return new AppSettings(); }
    }

    private void BuildUi()
    {
        var header = new Panel { Dock = DockStyle.Top, Height = 84, BackColor = Color.FromArgb(31, 41, 55), Padding = new Padding(24, 12, 24, 10) };
        var title = new Label { Text = "GitHub Trending Video", ForeColor = Color.White, Font = new Font("Microsoft YaHei UI", 18, FontStyle.Bold), AutoSize = true, Location = new Point(24, 12) };
        var subtitle = new Label { Text = "周榜项目 · 讲稿 · Kokoro 配音 · 竖屏视频", ForeColor = Color.FromArgb(203, 213, 225), AutoSize = true, Location = new Point(27, 48) };
        header.Controls.Add(title); header.Controls.Add(subtitle);

        var navigation = new Panel { Dock = DockStyle.Left, Width = 178, BackColor = Color.FromArgb(17, 24, 39), Padding = new Padding(12, 18, 12, 12) };
        var nav = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false };
        nav.Controls.Add(NavButton("视频制作", 0));
        nav.Controls.Add(NavButton("环境与下载", 1));
        nav.Controls.Add(NavButton("设置", 2));
        nav.Controls.Add(NavButton("运行日志", 3));
        nav.Controls.Add(new Label { Height = 18, Width = 140 });
        var version = new Label { Text = "桌面版 0.2\n复用 Node.js 流程", ForeColor = Color.FromArgb(148, 163, 184), AutoSize = true, Margin = new Padding(10, 10, 0, 0) };
        nav.Controls.Add(version); navigation.Controls.Add(nav);

        var runTab = new TabPage { Text = "运行流程", Padding = new Padding(0) };
        runTab.Controls.Add(BuildRunPage());
        var environmentTab = new TabPage { Text = "环境与下载", Padding = new Padding(0) };
        environmentTab.Controls.Add(BuildEnvironmentPage());
        var settingsTab = new TabPage { Text = "设置", Padding = new Padding(0) };
        settingsTab.Controls.Add(BuildSettingsPage());
        var logTab = new TabPage { Text = "运行日志", Padding = new Padding(12) };
        logTab.Controls.Add(BuildLogPage());
        _tabs.TabPages.AddRange([runTab, environmentTab, settingsTab, logTab]);
        _tabs.Appearance = TabAppearance.FlatButtons; _tabs.ItemSize = new Size(0, 1); _tabs.SizeMode = TabSizeMode.Fixed;

        Controls.Add(_tabs); Controls.Add(navigation); Controls.Add(header);
    }

    private Control BuildRunPage()
    {
        var root = new Panel { Dock = DockStyle.Fill, Padding = new Padding(18, 16, 18, 12) };
        var top = new Panel { Dock = DockStyle.Top, Height = 190, BackColor = Color.White, Padding = new Padding(18, 14, 18, 14) };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(0), Margin = new Padding(0) };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 26));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var title = new Label { Text = "生成本期视频", Font = new Font("Microsoft YaHei UI", 14, FontStyle.Bold), Dock = DockStyle.Fill, ForeColor = Color.FromArgb(15, 23, 42) };
        var description = new Label { Text = "点击“生成本期视频”开始。软件会按 1 → 5 顺序执行，完成后在输出目录查看 MP4。", Dock = DockStyle.Fill, AutoEllipsis = true, ForeColor = Color.FromArgb(71, 85, 105) };
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Margin = new Padding(0), Padding = new Padding(0, 4, 0, 0) };
        var runButton = Button("▶  生成本期视频", Color.FromArgb(37, 99, 235), 210, 40); runButton.AccessibleName = "执行完整流程"; runButton.Click += async (_, _) => await StartRunAsync(0);
        _resumeButton = Button("↪ 继续未完成", Color.FromArgb(14, 116, 144), 138, 34); _resumeButton.AccessibleName = "继续未完成流程"; _resumeButton.Margin = new Padding(12, 3, 0, 0); _resumeButton.Click += async (_, _) => await ResumeRunAsync();
        var stopButton = Button("停止", Color.FromArgb(220, 38, 38), 74, 34); stopButton.Margin = new Padding(12, 3, 0, 0); stopButton.Click += (_, _) => _runCancellation?.Cancel();
        var openButton = Button("打开输出", Color.FromArgb(71, 85, 105), 96, 34); openButton.Margin = new Padding(12, 3, 0, 0); openButton.Click += (_, _) => OpenOutputFolder();
        var restartButton = Button("重启应用", Color.FromArgb(107, 114, 128), 96, 34); restartButton.Margin = new Padding(12, 3, 0, 0); restartButton.Click += (_, _) => RestartApplication();
        actions.Controls.AddRange([runButton, _resumeButton, stopButton, openButton, restartButton]);
        _projectLabel.Text = ProjectDisplay();
        var progress = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Margin = new Padding(0), Padding = new Padding(0, 2, 0, 0) };
        _runLabel.Margin = new Padding(0, 2, 18, 0); _overallProgress.Margin = new Padding(0, 3, 12, 0); _overallLabel.Margin = new Padding(0, 2, 18, 0); _overallEtaLabel.Margin = new Padding(0, 2, 0, 0);
        progress.Controls.AddRange([_runLabel, _overallProgress, _overallLabel, _overallEtaLabel]);
        layout.Controls.Add(title, 0, 0); layout.Controls.Add(description, 0, 1); layout.Controls.Add(actions, 0, 2); layout.Controls.Add(_projectLabel, 0, 3); layout.Controls.Add(progress, 0, 4);
        top.Controls.Add(layout);

        foreach (var (label, descriptionText, key) in new[]
        {
            ("节点 1 · 采集周榜", "读取 GitHub Trending 周榜并保存本期快照。", "trending"),
            ("节点 2 · 收集项目资料", $"获取前 {_settings.TrendingTopN} 个仓库的 GitHub API 信息和 README。", "repos"),
            ("节点 3 · 生成讲稿", "按固定 9 段结构生成或读取缓存讲稿。", "scripts"),
            ("节点 4 · 生成中文配音", "用本机 Kokoro 按场景合成 WAV，并检查时长。", "tts"),
            ("节点 5 · 渲染视频", "用 Remotion 生成 1080×1920 H.264/AAC MP4。", "render"),
        })
        {
            var index = _cards.Count;
            var card = new NodeCard(index, label, descriptionText, key);
            card.RunClicked += async (_, _) => await StartRunAsync(index);
            card.OpenClicked += (_, _) => OpenNodeResult(index);
            _cards.Add(index, card); _nodeList.Controls.Add(card);
        }
        _nodeList.Resize += (_, _) => ResizeNodeCards();
        root.Resize += (_, _) => ResizeNodeCards();
        root.Controls.Add(_nodeList); root.Controls.Add(top); ResizeNodeCards(); return root;
    }

    private Control BuildEnvironmentPage()
    {
        var root = new Panel { Dock = DockStyle.Fill, Padding = new Padding(18, 16, 18, 12) };
        var top = new Panel { Dock = DockStyle.Top, Height = 94, BackColor = Color.White, Padding = new Padding(18, 14, 18, 12) };
        var title = new Label { Text = "环境检查与下载", Font = new Font("Microsoft YaHei UI", 13, FontStyle.Bold), AutoSize = true, Location = new Point(18, 12) };
        _environmentSummary.Location = new Point(18, 47);
        var refresh = Button("重新检查", Color.FromArgb(71, 85, 105), 96, 32); refresh.Anchor = AnchorStyles.Top | AnchorStyles.Right; refresh.Location = new Point(top.ClientSize.Width - top.Padding.Right - refresh.Width, 22); refresh.Click += async (_, _) => await RefreshEnvironmentAsync();
        top.Resize += (_, _) => refresh.Location = new Point(Math.Max(top.Padding.Left, top.ClientSize.Width - top.Padding.Right - refresh.Width), 22);
        top.Controls.AddRange([title, _environmentSummary, refresh]);
        _environmentList.Resize += (_, _) => ResizeEnvironmentCards();
        root.Resize += (_, _) => ResizeEnvironmentCards();
        root.Controls.Add(_environmentList); root.Controls.Add(top); ResizeEnvironmentCards(); return root;
    }

    private void ResizeNodeCards()
    {
        var width = Math.Max(420, _nodeList.ClientSize.Width - _nodeList.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth);
        foreach (var card in _cards.Values) card.Width = width;
    }

    private void ResizeEnvironmentCards()
    {
        var width = Math.Max(420, _environmentList.ClientSize.Width - _environmentList.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth);
        foreach (var card in _environmentCards.Values) card.Width = width;
    }

    private Control BuildSettingsPage()
    {
        var root = new Panel { Dock = DockStyle.Fill, Padding = new Padding(26, 22, 26, 22) };
        var scroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
        var table = new TableLayoutPanel { ColumnCount = 3, RowCount = 1, Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(0), ColumnStyles = { new ColumnStyle(SizeType.Absolute, 190), new ColumnStyle(SizeType.Percent, 100), new ColumnStyle(SizeType.Absolute, 220) } };
        var note = new Label { Text = "密钥会使用 Windows 当前用户 DPAPI 加密后保存到本机；项目流程只在运行时传给子进程。", AutoSize = true, ForeColor = Color.FromArgb(71, 85, 105), Margin = new Padding(0, 0, 0, 16) };
        table.Controls.Add(note, 0, 0); table.SetColumnSpan(note, 3);
        AddSetting(table, "项目目录", "project", _settings.ProjectDirectory, "选择包含 package.json 的项目目录", browse: true);
        AddSetting(table, "视频输出目录", "output", _settings.OutputDirectory, "留空则使用项目目录下的 output", browse: true);
        AddSetting(table, "模型服务地址", "baseUrl", _settings.OpenAiBaseUrl, "OpenAI 兼容接口，例如 https://api.buzzai.cc/v1");
        AddSetting(table, "模型名称", "model", _settings.OpenAiModel, "生成讲稿使用的模型名");
        AddSetting(table, "模型 API Key", "apiKey", _settings.OpenAiApiKey, "必填；保存时加密", password: true);
        AddSetting(table, "GitHub Token", "githubToken", _settings.GithubToken, "可选，用于降低公开 API 限流", password: true);
        var topNLabel = new Label { Text = "周榜项目数量", AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 12, 12, 12) };
        _topNBox.Value = Math.Clamp(_settings.TrendingTopN, (int)_topNBox.Minimum, (int)_topNBox.Maximum); _topNBox.Margin = new Padding(0, 8, 12, 8);
        var topNHelp = new Label { Text = "节点 2 获取周榜前 N 个项目（1–20）", AutoSize = true, ForeColor = Color.FromArgb(100, 116, 139), Margin = new Padding(0, 12, 0, 12), MaximumSize = new Size(300, 0) };
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize)); table.Controls.Add(topNLabel, 0, table.RowCount); table.Controls.Add(_topNBox, 1, table.RowCount); table.Controls.Add(topNHelp, 2, table.RowCount); table.RowCount++;
        AddSetting(table, "Kokoro 模型", "kokoroModel", _settings.KokoroModel, "默认 hexgrad/Kokoro-82M-v1.1-zh");
        AddVoiceSetting(table);
        AddSetting(table, "Remotion 浏览器路径", "browser", _settings.RemotionBrowserExecutable, "留空则使用软件下载的 Headless Chrome", browse: true);
        var deviceLabel = new Label { Text = "Kokoro 设备", AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 12, 12, 12) };
        _deviceBox.Items.AddRange(["cpu", "cuda"]); _deviceBox.SelectedItem = _settings.KokoroDevice; if (_deviceBox.SelectedIndex < 0) _deviceBox.SelectedIndex = 0; _deviceBox.Margin = new Padding(0, 8, 12, 8);
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize)); table.Controls.Add(deviceLabel, 0, table.RowCount); table.Controls.Add(_deviceBox, 1, table.RowCount); table.RowCount++;
        var speedLabel = new Label { Text = "Kokoro 语速", AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 12, 12, 12) }; _speedBox.Value = Math.Clamp(_settings.KokoroSpeed, _speedBox.Minimum, _speedBox.Maximum); _speedBox.Margin = new Padding(0, 8, 12, 8);
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize)); table.Controls.Add(speedLabel, 0, table.RowCount); table.Controls.Add(_speedBox, 1, table.RowCount); table.RowCount++;
        var buttons = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight, Margin = new Padding(0, 18, 0, 0) };
        var save = Button("保存设置", Color.FromArgb(37, 99, 235), 110, 34); save.Click += (_, _) => SaveSettingsFromUi();
        var test = Button("测试模型连接", Color.FromArgb(71, 85, 105), 130, 34); test.Click += async (_, _) => await TestModelAsync();
        buttons.Controls.Add(save); buttons.Controls.Add(test); table.RowStyles.Add(new RowStyle(SizeType.AutoSize)); table.Controls.Add(buttons, 0, table.RowCount); table.SetColumnSpan(buttons, 3); table.RowCount++;
        scroll.Controls.Add(table); root.Controls.Add(scroll); return root;
    }

    private Control BuildLogPage()
    {
        var root = new Panel { Dock = DockStyle.Fill }; var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 42, FlowDirection = FlowDirection.LeftToRight };
        var clear = Button("清空日志", Color.FromArgb(71, 85, 105), 88, 30); clear.Click += (_, _) => _log.Clear();
        var folder = Button("打开运行记录", Color.FromArgb(71, 85, 105), 118, 30); folder.Click += (_, _) => OpenOutputFolder();
        bar.Controls.Add(clear); bar.Controls.Add(folder); root.Controls.Add(_log); root.Controls.Add(bar); return root;
    }

    private void AddSetting(TableLayoutPanel table, string label, string key, string value, string help, bool password = false, bool browse = false)
    {
        var row = table.RowCount; table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        var caption = new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 12, 12, 12) };
        var box = new TextBox { Text = value, Dock = DockStyle.Fill, Margin = new Padding(0, 8, 12, 2), UseSystemPasswordChar = password, MinimumSize = new Size(160, 26) };
        _settingBoxes[key] = box;
        var helpLabel = new Label { Text = help, AutoSize = true, ForeColor = Color.FromArgb(100, 116, 139), Margin = new Padding(0, 12, 0, 12), MaximumSize = new Size(300, 0) };
        table.Controls.Add(caption, 0, row); table.Controls.Add(box, 1, row); table.Controls.Add(helpLabel, 2, row);
        if (browse)
        {
            var browseButton = Button("选择", Color.FromArgb(100, 116, 139), 70, 26); browseButton.Margin = new Padding(8, 7, 0, 0); browseButton.Click += (_, _) => BrowseInto(box, key == "browser" ? "file" : "folder");
            table.Controls.Remove(helpLabel); helpLabel.MaximumSize = new Size(138, 0); var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = false, WrapContents = false, FlowDirection = FlowDirection.LeftToRight }; flow.Controls.Add(helpLabel); flow.Controls.Add(browseButton); table.Controls.Add(flow, 2, row);
        }
        table.RowCount++;
    }

    private void AddVoiceSetting(TableLayoutPanel table)
    {
        var row = table.RowCount;
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        var caption = new Label { Text = "Kokoro 音色", AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 12, 12, 12) };
        _voiceBox.Margin = new Padding(0, 8, 8, 8);
        var refreshButton = Button("刷新", Color.FromArgb(100, 116, 139), 62, 28);
        refreshButton.Margin = new Padding(0, 8, 8, 8);
        refreshButton.Click += (_, _) => { RefreshVoiceChoices(); StartVoicePreviewWarmup(); };
        _previewVoiceButton = Button("连续试听", Color.FromArgb(37, 99, 235), 90, 28);
        _previewVoiceButton.Margin = new Padding(0, 8, 0, 8);
        _previewVoiceButton.Click += async (_, _) =>
        {
            if (_previewCancellation is not null) StopVoicePreview();
            else await PreviewVoiceAsync();
        };
        var controls = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Margin = new Padding(0) };
        controls.Controls.AddRange([_voiceBox, refreshButton, _previewVoiceButton]);
        _voiceStatusLabel = new Label { Text = "音色列表来自已下载的 Kokoro 模型；试听文件会后台准备。", AutoEllipsis = true, Location = new Point(25, 0), Height = 24, Width = 190, ForeColor = Color.FromArgb(100, 116, 139) };
        _voiceCacheProgress = new VoiceCacheIndicator { Location = new Point(1, 3), Size = new Size(20, 20), AccessibleName = "音色试听缓存进度" };
        var voiceCachePanel = new Panel { Dock = DockStyle.Fill, MinimumSize = new Size(210, 26), Margin = new Padding(0, 8, 0, 8) };
        voiceCachePanel.Controls.Add(_voiceCacheProgress);
        voiceCachePanel.Controls.Add(_voiceStatusLabel);
        table.Controls.Add(caption, 0, row);
        table.Controls.Add(controls, 1, row);
        table.Controls.Add(voiceCachePanel, 2, row);
        _voiceBox.SelectedIndexChanged += (_, _) =>
        {
            if (!_changingVoiceForPreview && _previewCancellation is not null) StopVoicePreview();
        };
        RefreshVoiceChoices();
        if (_settingBoxes.TryGetValue("kokoroModel", out var modelBox))
            modelBox.TextChanged += (_, _) => { StopVoicePreviewWarmup(); RefreshVoiceChoices(); };
        table.RowCount++;
    }

    private void RefreshVoiceChoices()
    {
        var selectedVoice = _voiceBox.SelectedItem?.ToString() ?? _settings.KokoroVoice;
        var model = _settingBoxes.GetValueOrDefault("kokoroModel")?.Text.Trim();
        if (string.IsNullOrWhiteSpace(model)) model = _settings.KokoroModel;
        var project = _paths.ResolveProjectDirectory(_settings);
        if (!string.IsNullOrWhiteSpace(_settingBoxes.GetValueOrDefault("project")?.Text.Trim()))
            project = _settingBoxes["project"].Text.Trim();

        var voices = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(project) && !string.IsNullOrWhiteSpace(model))
        {
            // Hugging Face cache encodes a repository slash as two dashes.
            var hfModelDirectory = Path.Combine(_paths.KokoroCacheDirectory(project), "hub", "models--" + model.Replace("/", "--", StringComparison.Ordinal));
            var modelSnapshots = Path.Combine(hfModelDirectory, "snapshots");
            if (Directory.Exists(modelSnapshots))
            {
                foreach (var snapshot in Directory.EnumerateDirectories(modelSnapshots))
                {
                    var voiceDirectory = Path.Combine(snapshot, "voices");
                    if (!Directory.Exists(voiceDirectory)) continue;
                    foreach (var file in Directory.EnumerateFiles(voiceDirectory, "*.pt"))
                        voices.Add(Path.GetFileNameWithoutExtension(file));
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(selectedVoice)) voices.Add(selectedVoice);
        _voiceBox.BeginUpdate();
        _voiceBox.Items.Clear();
        _voiceBox.Items.AddRange(voices.ToArray());
        _voiceBox.SelectedItem = voices.FirstOrDefault(voice => string.Equals(voice, selectedVoice, StringComparison.OrdinalIgnoreCase));
        if (_voiceBox.SelectedIndex < 0 && _voiceBox.Items.Count > 0) _voiceBox.SelectedIndex = 0;
        _voiceBox.EndUpdate();

        var cachedCount = 0;
        if (!string.IsNullOrWhiteSpace(project) && !string.IsNullOrWhiteSpace(model))
            cachedCount = voices.Count(voice => File.Exists(VoicePreviewPath(project, model, _speedBox.Value, voice)));
        if (voices.Count <= 1)
            SetVoiceCacheProgress(cachedCount, voices.Count, "未发现已下载的音色文件；可先在“环境与下载”下载模型。" );
        else
            SetVoiceCacheProgress(cachedCount, voices.Count, $"已缓存 {cachedCount}/{voices.Count} 个音色，试听文件会后台准备。" );
    }

    private void SetVoiceCacheProgress(int cached, int total, string? status = null)
    {
        _voiceCacheProgress?.SetProgress(cached, total);
        if (_voiceStatusLabel is not null && !string.IsNullOrWhiteSpace(status)) _voiceStatusLabel.Text = status;
    }

    private string CurrentVoiceProject()
    {
        var project = _paths.ResolveProjectDirectory(_settings);
        var boxValue = _settingBoxes.GetValueOrDefault("project")?.Text.Trim();
        return string.IsNullOrWhiteSpace(boxValue) ? project : boxValue;
    }

    private string CurrentVoiceModel() => _settingBoxes.GetValueOrDefault("kokoroModel")?.Text.Trim() ?? _settings.KokoroModel;

    private static string PreviewCacheKey(string value) => string.Concat(value.Select(character => char.IsLetterOrDigit(character) || character is '_' or '-' or '.' ? character : '_'));

    private string VoicePreviewDirectory(string project, string model, decimal speed)
    {
        var modelKey = PreviewCacheKey(model.Replace("/", "--", StringComparison.Ordinal));
        var speedKey = speed.ToString("0.00", CultureInfo.InvariantCulture);
        return Path.Combine(_paths.KokoroCacheDirectory(project), "previews", modelKey, speedKey);
    }

    private string VoicePreviewPath(string project, string model, decimal speed, string voice) => Path.Combine(VoicePreviewDirectory(project, model, speed), PreviewCacheKey(voice) + ".wav");

    private void StartVoicePreviewWarmup()
    {
        if (_voiceWarmupTask is { IsCompleted: false }) return;
        _voiceWarmupTask = WarmVoicePreviewCacheAsync();
    }

    private void StopVoicePreviewWarmup()
    {
        try { _voiceWarmupCancellation?.Cancel(); } catch { }
        _voiceWarmupCancellation = null;
    }

    private async Task WarmVoicePreviewCacheAsync()
    {
        var project = CurrentVoiceProject();
        var model = CurrentVoiceModel();
        var voices = _voiceBox.Items.Cast<object>().Select(item => item.ToString()).Where(voice => !string.IsNullOrWhiteSpace(voice)).Cast<string>().ToArray();
        if (string.IsNullOrWhiteSpace(project) || !Directory.Exists(project) || string.IsNullOrWhiteSpace(model) || voices.Length == 0)
        {
            Ui(() => SetVoiceCacheProgress(0, voices.Length, "等待项目目录、模型和音色列表就绪。"));
            return;
        }

        var python = _environment.PythonExecutable(project);
        var modelCache = Path.Combine(_paths.KokoroCacheDirectory(project), "hub", "models--" + model.Replace("/", "--", StringComparison.Ordinal));
        var script = Path.Combine(project, "tools", "kokoro_voice_previews.py");
        if (!File.Exists(python) || !Directory.Exists(Path.Combine(modelCache, "snapshots")) || !File.Exists(script))
        {
            var available = voices.Count(voice => File.Exists(VoicePreviewPath(project, model, _speedBox.Value, voice)));
            Ui(() => SetVoiceCacheProgress(available, voices.Length, "配音环境或模型未就绪，暂时无法准备试听缓存。"));
            return;
        }

        var speed = _speedBox.Value;
        var cacheDirectory = VoicePreviewDirectory(project, model, speed);
        Directory.CreateDirectory(cacheDirectory);
        var missing = voices.Where(voice => !File.Exists(VoicePreviewPath(project, model, speed, voice))).ToArray();
        if (missing.Length == 0)
        {
            Ui(() => SetVoiceCacheProgress(voices.Length, voices.Length, $"已缓存 {voices.Length}/{voices.Length} 个音色，试听文件已准备。"));
            return;
        }

        var cancellation = new CancellationTokenSource();
        _voiceWarmupCancellation = cancellation;
        var generated = voices.Length - missing.Length;
        Ui(() => SetVoiceCacheProgress(generated, voices.Length, $"正在准备试听缓存 {generated}/{voices.Length}…"));
        try
        {
            var env = new Dictionary<string, string?>
            {
                ["HF_HOME"] = _paths.KokoroCacheDirectory(project),
                ["HF_HUB_DISABLE_XET"] = "1",
                ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1",
                ["PYTHONIOENCODING"] = "utf-8",
            };
            var device = _deviceBox.SelectedItem?.ToString() ?? _settings.KokoroDevice;
            await _processes.RunCheckedAsync(python,
                [script, model, device, speed.ToString(CultureInfo.InvariantCulture), cacheDirectory, .. missing],
                project,
                env,
                line =>
                {
                    if (!line.StartsWith("KOKORO_PREVIEW_DONE:", StringComparison.Ordinal)) return;
                    var done = Interlocked.Increment(ref generated);
                    Ui(() => SetVoiceCacheProgress(done, voices.Length, $"正在准备试听缓存 {done}/{voices.Length}…"));
                },
                cancellation.Token);
            cancellation.Token.ThrowIfCancellationRequested();
            Ui(() => SetVoiceCacheProgress(voices.Length, voices.Length, $"已缓存 {voices.Length}/{voices.Length} 个音色，试听文件已准备。"));
        }
        catch (OperationCanceledException) { }
        catch (Exception error)
        {
            Ui(() => { SetVoiceCacheProgress(Math.Max(0, Volatile.Read(ref generated)), voices.Length, "试听缓存准备失败，请重新进入设置页重试。"); AppendLog($"音色试听缓存失败：{error.Message}"); });
        }
        finally
        {
            if (ReferenceEquals(_voiceWarmupCancellation, cancellation)) _voiceWarmupCancellation = null;
            cancellation.Dispose();
        }
    }

    private async Task PreviewVoiceAsync()
    {
        var project = CurrentVoiceProject();
        var model = CurrentVoiceModel();
        var voices = _voiceBox.Items.Cast<object>().Select(item => item.ToString()).Where(voice => !string.IsNullOrWhiteSpace(voice)).Cast<string>().ToArray();
        var selectedIndex = _voiceBox.SelectedIndex;
        if (string.IsNullOrWhiteSpace(project) || !Directory.Exists(project))
        {
            MessageBox.Show("请先在设置中选择有效的项目目录。", "无法试听", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (voices.Length == 0 || selectedIndex < 0)
        {
            MessageBox.Show("请先选择一个音色。", "无法试听", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var speed = _speedBox.Value;
        var uncachedVoices = voices.Where(voice => !File.Exists(VoicePreviewPath(project, model, speed, voice))).ToArray();
        if (uncachedVoices.Length > 0)
        {
            StartVoicePreviewWarmup();
            var warmup = _voiceWarmupTask;
            if (warmup is not null)
            {
                _voiceStatusLabel!.Text = $"正在准备 {voices[selectedIndex]} 试听文件，请稍候…";
                _previewVoiceButton!.Enabled = false;
                await warmup;
                _previewVoiceButton.Enabled = true;
            }
        }
        var availableVoices = voices.Where(voice => File.Exists(VoicePreviewPath(project, model, speed, voice))).ToArray();
        if (availableVoices.Length == 0)
        {
            MessageBox.Show("试听文件尚未准备好，请等待后台准备完成后再试听。", "无法试听", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var cancellation = new CancellationTokenSource();
        _previewCancellation = cancellation;
        _previewVoiceButton!.Text = "停止试听";
        try
        {
            var start = Array.FindIndex(availableVoices, voice => string.Equals(voice, voices[selectedIndex], StringComparison.OrdinalIgnoreCase));
            if (start < 0) start = 0;
            for (var index = Math.Max(0, start); index < availableVoices.Length; index++)
            {
                cancellation.Token.ThrowIfCancellationRequested();
                var voice = availableVoices[index];
                var audioPath = VoicePreviewPath(project, model, speed, voice);
                SetPreviewVoiceSelection(voice);
                _voiceStatusLabel!.Text = $"正在试听 {voice}（{index + 1}/{availableVoices.Length}）…点击停止后保留当前选择。";
                using var player = new SoundPlayer(audioPath);
                _previewPlayer = player;
                await Task.Run(() =>
                {
                    player.Load();
                    cancellation.Token.ThrowIfCancellationRequested();
                    player.Play();
                }, cancellation.Token);
                await Task.Delay(GetWaveDuration(audioPath), cancellation.Token);
                player.Stop();
                _previewPlayer = null;
                if (index + 1 < availableVoices.Length) await Task.Delay(120, cancellation.Token);
            }
            if (!cancellation.IsCancellationRequested) _voiceStatusLabel!.Text = "已试听完全部已缓存音色。";
        }
        catch (OperationCanceledException)
        {
            if (_voiceStatusLabel is not null) _voiceStatusLabel.Text = "试听已停止。";
        }
        catch (Exception) when (cancellation.IsCancellationRequested)
        {
            if (_voiceStatusLabel is not null) _voiceStatusLabel.Text = "试听已停止。";
        }
        catch (Exception error)
        {
            if (_voiceStatusLabel is not null) _voiceStatusLabel.Text = "试听失败。";
            MessageBox.Show(error.Message, "音色试听失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            if (ReferenceEquals(_previewCancellation, cancellation))
            {
                _previewCancellation = null;
                try { _previewPlayer?.Stop(); } catch { }
                _previewPlayer = null;
                _previewVoiceButton!.Text = "连续试听";
                _previewVoiceButton.Enabled = true;
            }
            cancellation.Dispose();
        }
    }

    private void SetPreviewVoiceSelection(string voice)
    {
        if (string.Equals(_voiceBox.SelectedItem?.ToString(), voice, StringComparison.OrdinalIgnoreCase)) return;
        _changingVoiceForPreview = true;
        try { _voiceBox.SelectedItem = voice; }
        finally { _changingVoiceForPreview = false; }
    }

    private static TimeSpan GetWaveDuration(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            using var reader = new BinaryReader(stream);
            if (new string(reader.ReadChars(4)) != "RIFF") return TimeSpan.FromSeconds(4);
            reader.ReadUInt32();
            if (new string(reader.ReadChars(4)) != "WAVE") return TimeSpan.FromSeconds(4);

            ushort channels = 0;
            uint sampleRate = 0;
            ushort bitsPerSample = 0;
            uint dataBytes = 0;
            while (stream.Position + 8 <= stream.Length)
            {
                var chunk = new string(reader.ReadChars(4));
                var size = reader.ReadUInt32();
                var next = Math.Min(stream.Length, stream.Position + size + (size % 2));
                if (chunk == "fmt " && size >= 16)
                {
                    reader.ReadUInt16();
                    channels = reader.ReadUInt16();
                    sampleRate = reader.ReadUInt32();
                    reader.ReadUInt32();
                    reader.ReadUInt16();
                    bitsPerSample = reader.ReadUInt16();
                }
                else if (chunk == "data")
                {
                    dataBytes = size;
                    break;
                }
                stream.Position = next;
            }

            var bytesPerSecond = sampleRate * channels * (bitsPerSample / 8d);
            return bytesPerSecond > 0 && dataBytes > 0
                ? TimeSpan.FromSeconds(dataBytes / bytesPerSecond)
                : TimeSpan.FromSeconds(4);
        }
        catch
        {
            return TimeSpan.FromSeconds(4);
        }
    }

    private Button NavButton(string text, int tabIndex)
    {
        var button = new Button { Text = text, Width = 150, Height = 42, FlatStyle = FlatStyle.Flat, FlatAppearance = { BorderSize = 0 }, ForeColor = Color.FromArgb(226, 232, 240), BackColor = Color.FromArgb(17, 24, 39), TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(14, 0, 0, 0), Margin = new Padding(0, 0, 0, 8) };
        button.Click += (_, _) => _tabs.SelectedIndex = tabIndex; return button;
    }

    private static Button Button(string text, Color color, int width, int height) => new() { Text = text, Width = width, Height = height, BackColor = color, ForeColor = Color.White, FlatStyle = FlatStyle.Flat, FlatAppearance = { BorderSize = 0 }, Cursor = Cursors.Hand };

    private void WireEvents()
    {
        _pipeline.StepChanged += (index, status, progress) => Ui(() =>
        {
            if (_cards.TryGetValue(index, out var card)) card.SetState(status, progress);
            if (index is >= 0 and < 5)
            {
                if (status == "运行中")
                {
                    if (_activeNodeIndex != index) _nodeStartedAt[index] = DateTimeOffset.UtcNow;
                    _activeNodeIndex = index;
                    _activeNodeProgress = progress;
                    _activeNodeStatus = status;
                    _nodeCompleted[index] = false;
                }
                else if (status == "已完成")
                {
                    if (_nodeStartedAt[index].HasValue) _nodeDurationsSeconds[index] = Math.Max(0.1, (DateTimeOffset.UtcNow - _nodeStartedAt[index]!.Value).TotalSeconds);
                    _nodeCompleted[index] = true;
                    _completedNodeCount = Math.Max(_completedNodeCount, index + 1);
                    _activeNodeProgress = 100;
                    _activeNodeStatus = status;
                }
                else if (status == "失败")
                {
                    _activeNodeIndex = index;
                    _activeNodeProgress = progress;
                    _activeNodeStatus = status;
                    _nodeCompleted[index] = false;
                }
            }
            UpdateEtaDisplay();
        });
        _pipeline.OverallProgressChanged += (done, total) => Ui(() => { _overallProgress.Maximum = total; _overallProgress.Value = Math.Min(done, total); _completedNodeCount = done; _overallLabel.Text = $"整体进度 {done}/{total}"; UpdateEtaDisplay(); });
        _pipeline.LogLine += line => Ui(() => AppendLog(line));
        _pipeline.RunIdChanged += runId => Ui(() => { _runLabel.Text = $"正在运行 · {runId}"; _runLabel.ForeColor = Color.FromArgb(37, 99, 235); UpdateEtaDisplay(); });
    }

    private async Task StartRunAsync(int startIndex, bool offerNode3Recovery = true)
    {
        if (_busy) { MessageBox.Show("已有运行正在进行，请先停止或等待完成。", "正在运行", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
        _tabs.SelectedIndex = 0;
        SaveSettingsFromUi(false);
        var project = _paths.ResolveProjectDirectory(_settings);
        if (string.IsNullOrWhiteSpace(project)) { MessageBox.Show("请先在设置中选择包含 package.json 的项目目录。", "缺少项目目录", MessageBoxButtons.OK, MessageBoxIcon.Warning); _tabs.SelectedIndex = 2; return; }
        if (string.IsNullOrWhiteSpace(_settings.OpenAiModel) || string.IsNullOrWhiteSpace(_settings.OpenAiApiKey)) { MessageBox.Show("节点 3 需要模型服务地址、模型名称和 API Key。请先完成设置。", "缺少讲稿模型设置", MessageBoxButtons.OK, MessageBoxIcon.Warning); _tabs.SelectedIndex = 2; return; }
        BeginProgressTracking(startIndex);
        _busy = true; _runCancellation = new CancellationTokenSource(); _etaTimer.Start(); SetRunButtonsEnabled(false); AppendLog($"开始从节点 {startIndex + 1} 运行，项目目录：{project}");
        var retryFromNode3 = false;
        try
        {
            await _pipeline.RunFromStepAsync(startIndex, _settings, project, _runCancellation.Token);
            _runLabel.Text = "运行完成 · 可打开输出检查视频"; _runLabel.ForeColor = Color.FromArgb(22, 163, 74); UpdateEtaDisplay(); RefreshEnvironmentAsync().Forget();
            MessageBox.Show("本期 5 个节点已完成。请在输出目录逐条检查视频、字幕和配音。", "生成完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (OperationCanceledException) { _runLabel.Text = "已停止运行"; _runLabel.ForeColor = Color.FromArgb(217, 119, 6); }
        catch (Exception error)
        {
            _runLabel.Text = "运行失败 · 可从失败节点重试"; _runLabel.ForeColor = Color.FromArgb(220, 38, 38);
            var needsNode3Recovery = offerNode3Recovery && startIndex != 2 &&
                (error.Message.Contains("节点 3", StringComparison.Ordinal) || error.Message.Contains("自动压缩讲稿", StringComparison.Ordinal));
            if (needsNode3Recovery)
            {
                var choice = MessageBox.Show(
                    "节点 4 的超长讲稿需要重新生成。点击“确定”后将从节点 3 重新生成讲稿，并自动继续节点 4。",
                    "从节点 3 重试",
                    MessageBoxButtons.OKCancel,
                    MessageBoxIcon.Warning);
                retryFromNode3 = choice == DialogResult.OK;
                if (!retryFromNode3) MessageBox.Show(error.Message, "运行失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            else MessageBox.Show(error.Message, "运行失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { _busy = false; _etaTimer.Stop(); _runCancellation?.Dispose(); _runCancellation = null; SetRunButtonsEnabled(true); await RefreshRunStateAsync(); }
        if (retryFromNode3) await StartRunAsync(2, false);
    }

    private async Task ResumeRunAsync()
    {
        var project = _paths.ResolveProjectDirectory(_settings);
        if (string.IsNullOrWhiteSpace(project)) { MessageBox.Show("请先在设置中选择项目目录。", "缺少项目目录", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        var output = _paths.OutputDirectory(_settings, project);
        var latestFile = Path.Combine(output, "latest-run.json");
        if (!File.Exists(latestFile)) { MessageBox.Show("还没有可继续的运行记录，请先生成本期视频。", "没有可继续的流程", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
        try
        {
            using var latest = JsonDocument.Parse(await File.ReadAllTextAsync(latestFile));
            var runId = latest.RootElement.GetProperty("runId").GetString();
            if (string.IsNullOrWhiteSpace(runId)) throw new InvalidOperationException("最近运行记录无效。");
            var reportFile = Path.Combine(output, runId, "run-report.json");
            if (!File.Exists(reportFile)) throw new InvalidOperationException("最近运行缺少状态记录。");
            var report = JsonSerializer.Deserialize<PipelineReport>(await File.ReadAllTextAsync(reportFile));
            if (report is null) throw new InvalidOperationException("最近运行状态记录无效。");
            _nodeDurationsSeconds.Clear();
            foreach (var (label, seconds) in report.NodeDurationsSeconds ?? [])
                if (label.StartsWith("节点 ") && int.TryParse(label[3..], out var node) && node is >= 1 and <= 5) _nodeDurationsSeconds[node - 1] = Math.Max(0.1, seconds);
            var failed = report.FailedAt is not null && int.TryParse(report.FailedAt.Replace("节点 ", "", StringComparison.Ordinal), out var failedNode) ? failedNode - 1 : -1;
            var startIndex = failed >= 0 ? failed : Enumerable.Range(0, 5).FirstOrDefault(index => !report.CompletedNodes.Contains($"节点 {index + 1}"), 5);
            if (startIndex >= 5) { MessageBox.Show("最近一期已经完成全部节点。", "无需继续", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
            await StartRunAsync(startIndex);
        }
        catch (Exception error) { MessageBox.Show(error.Message, "无法继续流程", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private void BeginProgressTracking(int startIndex)
    {
        if (startIndex == 0) _nodeDurationsSeconds.Clear();
        _activeNodeIndex = -1;
        _activeNodeProgress = 0;
        _activeNodeStatus = "等待中";
        _completedNodeCount = Math.Clamp(startIndex, 0, 5);
        for (var index = 0; index < 5; index++)
        {
            _nodeStartedAt[index] = null;
            _nodeCompleted[index] = index < startIndex;
            if (_cards.TryGetValue(index, out var card))
            {
                card.SetState(index < startIndex ? "已完成" : "等待中", index < startIndex ? 100 : 0);
                card.SetEta(index < startIndex ? "已完成" : "等待中");
            }
        }
        _overallProgress.Maximum = 5;
        _overallProgress.Value = _completedNodeCount;
        _overallLabel.Text = $"整体进度 {_completedNodeCount}/5";
        _overallEtaLabel.Text = "预计剩余 正在估算…";
    }

    private void UpdateEtaDisplay()
    {
        for (var index = 0; index < 5; index++)
        {
            if (!_cards.TryGetValue(index, out var card)) continue;
            if (_nodeCompleted[index]) card.SetEta("已完成");
            else if (_busy && index == _activeNodeIndex && _activeNodeStatus == "运行中") card.SetEta($"预计剩余 {FormatRemaining(EstimateNodeRemaining(index))}");
            else if (_activeNodeStatus == "失败" && index == _activeNodeIndex) card.SetEta("未完成");
            else card.SetEta("等待中");
        }

        if (!_busy && _nodeCompleted.All(completed => completed))
        {
            _overallEtaLabel.Text = "预计剩余 已完成";
            return;
        }
        _overallEtaLabel.Text = $"预计剩余 {FormatRemaining(EstimateOverallRemaining())}";
    }

    private TimeSpan? EstimateNodeRemaining(int index)
    {
        if (!_nodeStartedAt[index].HasValue) return null;
        var elapsed = DateTimeOffset.UtcNow - _nodeStartedAt[index]!.Value;
        if (_nodeDurationsSeconds.TryGetValue(index, out var knownSeconds)) return TimeSpan.FromSeconds(Math.Max(0, knownSeconds - elapsed.TotalSeconds));
        if (_activeNodeProgress <= 2) return null;
        var totalSeconds = elapsed.TotalSeconds * 100 / _activeNodeProgress;
        return TimeSpan.FromSeconds(Math.Max(0, totalSeconds - elapsed.TotalSeconds));
    }

    private TimeSpan? EstimateOverallRemaining()
    {
        if (!_busy || _activeNodeIndex < 0) return null;
        var currentRemaining = EstimateNodeRemaining(_activeNodeIndex);
        if (!currentRemaining.HasValue) return null;
        var elapsed = _nodeStartedAt[_activeNodeIndex].HasValue ? DateTimeOffset.UtcNow - _nodeStartedAt[_activeNodeIndex]!.Value : TimeSpan.Zero;
        var currentTotal = currentRemaining.Value + elapsed;
        var known = _nodeDurationsSeconds.Values.Where(seconds => seconds > 0).ToArray();
        var fallback = known.Length > 0 ? TimeSpan.FromSeconds(known.Average()) : currentTotal;
        var remaining = currentRemaining.Value;
        for (var index = _activeNodeIndex + 1; index < 5; index++)
            remaining += _nodeDurationsSeconds.TryGetValue(index, out var seconds) ? TimeSpan.FromSeconds(seconds) : fallback;
        return remaining;
    }

    private static string FormatRemaining(TimeSpan? remaining)
    {
        if (!remaining.HasValue) return "正在估算…";
        var seconds = Math.Max(0, (long)Math.Ceiling(remaining.Value.TotalSeconds));
        return seconds >= 3600 ? $"{seconds / 3600:00}:{seconds % 3600 / 60:00}:{seconds % 60:00}" : $"{seconds / 60:00}:{seconds % 60:00}";
    }

    private void StopVoicePreview()
    {
        try { _previewCancellation?.Cancel(); } catch { }
        _previewCancellation = null;
        try { _previewPlayer?.Stop(); } catch { }
        _previewPlayer = null;
        if (_previewVoiceButton is not null) { _previewVoiceButton.Enabled = true; _previewVoiceButton.Text = "连续试听"; }
        if (_voiceStatusLabel is not null) _voiceStatusLabel.Text = "试听已停止。";
    }

    private void RestartApplication()
    {
        if (_busy)
        {
            var choice = MessageBox.Show("当前流程正在运行，重启会先停止它。是否继续？", "确认重启", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (choice != DialogResult.Yes) return;
            _runCancellation?.Cancel();
        }

        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable))
        {
            MessageBox.Show("无法找到当前应用程序路径。", "重启失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        Process.Start(new ProcessStartInfo
        {
            FileName = executable,
            Arguments = $"--wait-for-parent {Environment.ProcessId}",
            WorkingDirectory = AppContext.BaseDirectory,
            UseShellExecute = true,
        });
        Application.Exit();
    }

    private void SetRunButtonsEnabled(bool enabled)
    {
        foreach (var card in _cards.Values) card.SetRunEnabled(enabled);
        if (_resumeButton is not null) _resumeButton.Enabled = enabled;
    }

    private async Task RefreshAllAsync()
    {
        _projectLabel.Text = ProjectDisplay();
        await RefreshRunStateAsync();
        await RefreshEnvironmentAsync();
    }

    private async Task RefreshRunStateAsync()
    {
        var project = _paths.ResolveProjectDirectory(_settings); if (string.IsNullOrWhiteSpace(project)) return;
        var output = _paths.OutputDirectory(_settings, project); var latest = Path.Combine(output, "latest-run.json");
        if (!File.Exists(latest)) return;
        try
        {
            using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(latest)); var runId = doc.RootElement.GetProperty("runId").GetString(); if (string.IsNullOrWhiteSpace(runId)) return;
            var reportFile = Path.Combine(output, runId, "run-report.json"); if (!File.Exists(reportFile)) return;
            var report = JsonSerializer.Deserialize<PipelineReport>(await File.ReadAllTextAsync(reportFile)); if (report is null) return;
            _nodeDurationsSeconds.Clear();
            foreach (var (label, seconds) in report.NodeDurationsSeconds ?? [])
                if (label.StartsWith("节点 ") && int.TryParse(label[3..], out var node) && node is >= 1 and <= 5) _nodeDurationsSeconds[node - 1] = Math.Max(0.1, seconds);
            var failed = report.FailedAt is not null && int.TryParse(report.FailedAt.Replace("节点 ", "", StringComparison.Ordinal), out var failedNode)
                ? failedNode - 1
                : -1;
            _completedNodeCount = failed >= 0
                ? report.CompletedNodes.Count(label => int.TryParse(label.Replace("节点 ", "", StringComparison.Ordinal), out var node) && node - 1 < failed)
                : report.CompletedNodes.Count;
            _activeNodeIndex = -1;
            for (var index = 0; index < 5; index++)
            {
                _nodeCompleted[index] = failed >= 0
                    ? index < failed && report.CompletedNodes.Contains($"节点 {index + 1}")
                    : report.CompletedNodes.Contains($"节点 {index + 1}");
                var isFailed = failed == index;
                _cards[index].SetState(_nodeCompleted[index] ? "已完成" : isFailed ? "失败" : "等待中", _nodeCompleted[index] ? 100 : 0);
                _cards[index].SetEta(_nodeCompleted[index] ? "已完成" : isFailed ? "未完成" : "等待中");
            }
            _runLabel.Text = report.Status == "nodes-1-to-5-complete" ? $"最近运行已完成 · {runId}" : report.Status == "failed" ? $"最近运行失败 · {report.FailedAt}" : $"最近运行 · {runId}";
            _overallProgress.Maximum = 5; _overallProgress.Value = Math.Clamp(_completedNodeCount, 0, 5); _overallLabel.Text = $"整体进度 {_completedNodeCount}/5";
            _overallEtaLabel.Text = report.Status == "nodes-1-to-5-complete" ? "预计剩余 已完成" : "预计剩余 正在估算…";
            if (_resumeButton is not null) _resumeButton.Enabled = (report.Status == "failed" && report.FailedAt is not null) || (report.Status != "nodes-1-to-5-complete" && report.CompletedNodes.Count < 5);
        }
        catch { }
    }

    private async Task RefreshEnvironmentAsync()
    {
        var project = _paths.ResolveProjectDirectory(_settings); if (string.IsNullOrWhiteSpace(project)) { _environmentSummary.Text = "请先在设置中选择项目目录。"; return; }
        try
        {
            _environmentSummary.Text = "正在检查 Node.js、Python、Kokoro、模型和 Remotion 浏览器…";
            var items = await _environment.CheckAsync(_settings, project);
            _environmentList.Controls.Clear(); _environmentCards.Clear();
            foreach (var item in items)
            {
                var card = new EnvironmentCard(item); card.ActionClicked += async (_, _) => await EnvironmentActionAsync(item.Id); _environmentCards[item.Id] = card; _environmentList.Controls.Add(card);
            }
            var ready = items.Count(x => x.State == EnvironmentCheckState.Ready); _environmentSummary.Text = $"{ready}/{items.Count} 项就绪 · 缺少组件可直接下载安装；安装过程会显示进度和日志。";
        }
        catch (Exception error) { _environmentSummary.Text = $"检查失败：{error.Message}"; }
    }

    private async Task EnvironmentActionAsync(string id)
    {
        if (_busy) { MessageBox.Show("请等待当前流程完成后再安装依赖。", "正在运行", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
        SaveSettingsFromUi(false); var project = _paths.ResolveProjectDirectory(_settings); if (string.IsNullOrWhiteSpace(project)) return;
        var card = _environmentCards.GetValueOrDefault(id); card?.SetBusy(true); _tabs.SelectedIndex = 3;
        try
        {
            var progress = new Progress<(long done, long? total)>(value => Ui(() => card?.SetProgress(value.done, value.total)));
            switch (id)
            {
                case "node": await _environment.InstallNodeAsync(progress, AppendLog, CancellationToken.None); break;
                case "js-deps": await _environment.InstallProjectDependenciesAsync(project, AppendLog, CancellationToken.None); break;
                case "python": await _environment.InstallKokoroAsync(project, progress, AppendLog, CancellationToken.None); break;
                case "model": await _environment.DownloadKokoroModelAsync(_settings, project, AppendLog, CancellationToken.None); break;
                case "browser": await _environment.EnsureRemotionBrowserAsync(project, AppendLog, CancellationToken.None); break;
            }
            AppendLog($"{id} 操作完成。"); await RefreshEnvironmentAsync();
        }
        catch (Exception error) { AppendLog($"环境操作失败：{error.Message}"); MessageBox.Show(error.Message, "安装或下载失败", MessageBoxButtons.OK, MessageBoxIcon.Error); card?.SetError(error.Message); }
        finally { card?.SetBusy(false); }
    }

    private async Task TestModelAsync()
    {
        SaveSettingsFromUi(false);
        if (string.IsNullOrWhiteSpace(_settings.OpenAiApiKey) || string.IsNullOrWhiteSpace(_settings.OpenAiModel)) { MessageBox.Show("请先填写模型名称和 API Key。", "设置不完整", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) }; using var request = new HttpRequestMessage(HttpMethod.Get, _settings.OpenAiBaseUrl.TrimEnd('/') + "/models"); request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _settings.OpenAiApiKey); using var response = await client.SendAsync(request); var body = await response.Content.ReadAsStringAsync(); if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"HTTP {(int)response.StatusCode}: {body[..Math.Min(500, body.Length)]}"); MessageBox.Show("模型服务连接成功。", "连接测试", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception error) { MessageBox.Show(error.Message, "连接测试失败", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private void SaveSettingsFromUi(bool showMessage = true)
    {
        _settings.ProjectDirectory = _settingBoxes.GetValueOrDefault("project")?.Text.Trim() ?? _settings.ProjectDirectory;
        _settings.OutputDirectory = _settingBoxes.GetValueOrDefault("output")?.Text.Trim() ?? _settings.OutputDirectory;
        _settings.OpenAiBaseUrl = _settingBoxes.GetValueOrDefault("baseUrl")?.Text.Trim() ?? _settings.OpenAiBaseUrl;
        _settings.OpenAiModel = _settingBoxes.GetValueOrDefault("model")?.Text.Trim() ?? _settings.OpenAiModel;
        _settings.OpenAiApiKey = _settingBoxes.GetValueOrDefault("apiKey")?.Text ?? _settings.OpenAiApiKey;
        _settings.OpenAiBaseUrl = AppSettings.ResolveModelBaseUrl(_settings.OpenAiBaseUrl, _settings.OpenAiApiKey);
        if (_settingBoxes.TryGetValue("baseUrl", out var baseUrlBox)) baseUrlBox.Text = _settings.OpenAiBaseUrl;
        _settings.GithubToken = _settingBoxes.GetValueOrDefault("githubToken")?.Text ?? _settings.GithubToken;
        _settings.TrendingTopN = (int)_topNBox.Value;
        _settings.KokoroModel = _settingBoxes.GetValueOrDefault("kokoroModel")?.Text.Trim() ?? _settings.KokoroModel;
        _settings.KokoroVoice = _voiceBox.SelectedItem?.ToString() ?? _settings.KokoroVoice;
        _settings.RemotionBrowserExecutable = _settingBoxes.GetValueOrDefault("browser")?.Text.Trim() ?? _settings.RemotionBrowserExecutable;
        _settings.KokoroDevice = _deviceBox.SelectedItem?.ToString() ?? "cpu"; _settings.KokoroSpeed = _speedBox.Value;
        _cards.GetValueOrDefault(1)?.SetDescription($"获取前 {_settings.TrendingTopN} 个仓库的 GitHub API 信息和 README。");
        try { _settingsStore.Save(_settings); if (showMessage) MessageBox.Show("设置已保存。", "设置", MessageBoxButtons.OK, MessageBoxIcon.Information); _projectLabel.Text = ProjectDisplay(); }
        catch (Exception error) { MessageBox.Show(error.Message, "设置保存失败", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private void BrowseInto(TextBox box, string mode)
    {
        if (mode == "file") { using var dialog = new OpenFileDialog { Filter = "可执行文件|*.exe|所有文件|*.*", Title = "选择 Remotion 浏览器可执行文件" }; if (dialog.ShowDialog(this) == DialogResult.OK) box.Text = dialog.FileName; return; }
        using var folder = new FolderBrowserDialog { Description = "选择目录" }; if (folder.ShowDialog(this) == DialogResult.OK) box.Text = folder.SelectedPath;
    }

    private string ProjectDisplay() => string.IsNullOrWhiteSpace(_settings.ProjectDirectory) ? "项目目录：未设置" : $"项目目录：{_settings.ProjectDirectory}";

    private void OpenOutputFolder()
    {
        var project = _paths.ResolveProjectDirectory(_settings); if (string.IsNullOrWhiteSpace(project)) return; var directory = _paths.OutputDirectory(_settings, project); Directory.CreateDirectory(directory); Process.Start(new ProcessStartInfo("explorer.exe", directory) { UseShellExecute = true });
    }

    private void OpenNodeResult(int index)
    {
        var project = _paths.ResolveProjectDirectory(_settings); if (string.IsNullOrWhiteSpace(project)) return; var output = _paths.OutputDirectory(_settings, project); if (!File.Exists(Path.Combine(output, "latest-run.json"))) { OpenOutputFolder(); return; }
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(output, "latest-run.json"))); var runId = doc.RootElement.GetProperty("runId").GetString(); if (string.IsNullOrWhiteSpace(runId)) return;
        var path = index switch { 0 => Path.Combine(output, runId, "trending.json"), 1 => Path.Combine(output, runId, "repos"), 2 => Path.Combine(output, runId, "scripts"), 3 => Path.Combine(output, runId, "audio"), _ => Path.Combine(output, runId, "renders") };
        if (File.Exists(path)) Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true }); else if (Directory.Exists(path)) Process.Start(new ProcessStartInfo("explorer.exe", path) { UseShellExecute = true }); else OpenOutputFolder();
    }

    private void AppendLog(string line) { if (string.IsNullOrWhiteSpace(line)) return; _log.AppendText($"[{DateTime.Now:HH:mm:ss}] {line}{Environment.NewLine}"); _log.SelectionStart = _log.TextLength; _log.ScrollToCaret(); }
    private void Ui(Action action) { if (IsDisposed) return; if (InvokeRequired) BeginInvoke(action); else action(); }

    private sealed class VoiceCacheIndicator : Control
    {
        private int cached;
        private int total;
        private readonly ToolTip tooltip = new();

        public VoiceCacheIndicator()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            AccessibleRole = AccessibleRole.ProgressBar;
            tooltip.SetToolTip(this, "音色试听缓存进度");
        }

        public void SetProgress(int completed, int count)
        {
            cached = Math.Max(0, completed);
            total = Math.Max(0, count);
            AccessibleName = total > 0 ? $"音色试听缓存 {cached}/{total}" : "音色试听缓存等待中";
            tooltip.SetToolTip(this, AccessibleName);
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            var bounds = new Rectangle(2, 2, Math.Max(1, ClientSize.Width - 4), Math.Max(1, ClientSize.Height - 4));
            using var background = new SolidBrush(Color.FromArgb(226, 232, 240));
            e.Graphics.FillEllipse(background, bounds);
            if (total > 0 && cached > 0)
            {
                var sweep = 360f * Math.Clamp(cached / (float)total, 0, 1);
                using var progress = new SolidBrush(Color.FromArgb(37, 99, 235));
                e.Graphics.FillPie(progress, bounds, -90, sweep);
            }
            using var outline = new Pen(Color.FromArgb(148, 163, 184), 1f);
            e.Graphics.DrawEllipse(outline, bounds);
        }
    }

    private sealed class NodeCard : Panel
    {
        private readonly Label _status = new() { AutoEllipsis = true, Font = new Font("Microsoft YaHei UI", 9, FontStyle.Bold), Location = new Point(18, 16), Height = 22 };
        private readonly ProgressBar _progress = new() { Width = 300, Height = 14, Location = new Point(18, 58) };
        private readonly Label _eta = new() { AutoEllipsis = true, ForeColor = Color.FromArgb(71, 85, 105), Location = new Point(18, 76), Height = 18 };
        private readonly Label _description = new() { AutoEllipsis = true, ForeColor = Color.FromArgb(71, 85, 105), Location = new Point(18, 38), Width = 580 };
        private readonly Button _run = Button("重试此节点", Color.FromArgb(37, 99, 235), 100, 30);
        private readonly Button _open = Button("打开结果", Color.FromArgb(100, 116, 139), 88, 30);
        public event EventHandler? RunClicked; public event EventHandler? OpenClicked;
        public NodeCard(int index, string title, string description, string key)
        {
            Width = 600; Height = 106; Margin = new Padding(0, 0, 0, 10); BackColor = Color.White; BorderStyle = BorderStyle.FixedSingle;
            _status.Text = title + " · 等待中"; _description.Text = description; _eta.Text = "等待中"; _run.Click += (_, _) => RunClicked?.Invoke(this, EventArgs.Empty); _open.Click += (_, _) => OpenClicked?.Invoke(this, EventArgs.Empty); Resize += (_, _) => LayoutChildren(); Controls.AddRange([_status, _description, _progress, _eta, _run, _open]); LayoutChildren();
        }
        private void LayoutChildren()
        {
            var right = ClientSize.Width - 18;
            _open.Location = new Point(Math.Max(18, right - _open.Width), 24);
            _run.Location = new Point(Math.Max(18, _open.Left - 12 - _run.Width), 24);
            var textWidth = Math.Max(120, _run.Left - 36);
            _status.Width = textWidth;
            _description.Width = textWidth; _progress.Width = textWidth; _eta.Width = textWidth;
        }
        public void SetState(string state, int progress) { _status.Text = _status.Text.Split('·')[0].Trim() + " · " + state; _status.ForeColor = state switch { "已完成" => Color.FromArgb(22, 163, 74), "失败" => Color.FromArgb(220, 38, 38), "运行中" => Color.FromArgb(37, 99, 235), _ => Color.FromArgb(100, 116, 139) }; _progress.Value = Math.Clamp(progress, 0, 100); }
        public void SetEta(string text) => _eta.Text = text;
        public void SetDescription(string text) => _description.Text = text;
        public void SetRunEnabled(bool enabled) => _run.Enabled = enabled;
    }

    private sealed class EnvironmentCard : Panel
    {
        private readonly Label _title = new() { AutoEllipsis = true, Font = new Font("Microsoft YaHei UI", 10, FontStyle.Bold), Location = new Point(16, 13), Height = 24 };
        private readonly Label _detail = new() { AutoEllipsis = true, ForeColor = Color.FromArgb(71, 85, 105), Location = new Point(16, 41), Width = 680 };
        private readonly Button _action = Button("操作", Color.FromArgb(37, 99, 235), 122, 32);
        private readonly ProgressBar _progress = new() { Width = 180, Height = 12, Visible = false, Location = new Point(510, 16) };
        public event EventHandler? ActionClicked;
        public EnvironmentCard(EnvironmentItem item)
        {
            Width = 600; Height = 82; Margin = new Padding(0, 0, 0, 10); BackColor = Color.White; BorderStyle = BorderStyle.FixedSingle; _title.Text = item.Title; _detail.Text = $"{item.Description}  {item.Detail}"; _action.Text = item.ActionLabel; _action.Enabled = item.State != EnvironmentCheckState.Ready; _action.Click += (_, _) => ActionClicked?.Invoke(this, EventArgs.Empty); _title.ForeColor = item.State == EnvironmentCheckState.Ready ? Color.FromArgb(22, 163, 74) : Color.FromArgb(31, 41, 55); Resize += (_, _) => LayoutChildren(); Controls.AddRange([_title, _detail, _progress, _action]); LayoutChildren();
        }
        private void LayoutChildren()
        {
            var right = ClientSize.Width - 16;
            _action.Location = new Point(Math.Max(16, right - _action.Width), 22);
            var progressLeft = Math.Max(180, _action.Left - 16 - _progress.Width);
            _progress.Location = new Point(progressLeft, 16);
            _title.Width = Math.Max(120, progressLeft - 28);
            _detail.Width = Math.Max(120, progressLeft - 28);
        }
        public void SetBusy(bool busy) { _action.Enabled = !busy; _action.Text = busy ? "处理中…" : "重试"; _progress.Visible = busy; }
        public void SetProgress(long done, long? total) { _progress.Style = total is null ? ProgressBarStyle.Marquee : ProgressBarStyle.Continuous; if (total is > 0) _progress.Value = (int)Math.Clamp(done * 100 / total.Value, 0, 100); }
        public void SetError(string error) { _detail.Text = error; _detail.ForeColor = Color.FromArgb(220, 38, 38); }
    }
}

internal static class TaskExtensions
{
    public static void Forget(this Task task) { _ = task.ContinueWith(_ => { }, TaskScheduler.Default); }
}
