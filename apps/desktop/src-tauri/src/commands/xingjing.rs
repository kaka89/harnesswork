use std::fs;
use std::path::PathBuf;
use std::process::Command;

use crate::paths::home_dir;
use serde::Deserialize;

/// 单个文件条目（路径相对于 workDir）
#[derive(Deserialize)]
pub struct XingjingFileEntry {
    pub path: String,
    pub content: String,
}

/// 在 workDir 下批量写入文件，自动创建目标目录及所有父目录（mkdir -p）
///
/// 返回成功写入的文件数量，失败时返回第一个错误信息。
#[tauri::command]
pub fn xingjing_init_product_dir(
    work_dir: String,
    files: Vec<XingjingFileEntry>,
) -> Result<usize, String> {
    let base = PathBuf::from(work_dir.trim());

    // 目标目录不存在时自动创建（支持创建团队版中尚未存在的产品线/Domain/App 子目录）
    fs::create_dir_all(&base).map_err(|e| {
        format!("创建工作目录失败 {}: {e}", base.display())
    })?;

    let total = files.len();
    for entry in &files {
        let abs_path = base.join(&entry.path);

        // 自动创建所有父级目录
        if let Some(parent) = abs_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!("创建目录失败 {}: {e}", parent.display())
            })?;
        }

        fs::write(&abs_path, &entry.content).map_err(|e| {
            format!("写入文件失败 {}: {e}", abs_path.display())
        })?;
    }

    Ok(total)
}

/// 删除产品工作目录（递归删除所有内容）
///
/// 目录不存在时视为成功，防止重复删除报错。
#[tauri::command]
pub fn xingjing_delete_product_dir(work_dir: String) -> Result<(), String> {
    let path = PathBuf::from(work_dir.trim());
    if !path.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&path)
        .map_err(|e| format!("删除目录失败 {}: {e}", path.display()))
}

// ─── Git 检测与安装 ───────────────────────────────────────────────────────────

/// 尝试在常见路径中找到 git 可执行文件
fn find_git_binary() -> Option<PathBuf> {
    // 已知常见安装位置
    let known_paths = [
        "/usr/bin/git",
        "/usr/local/bin/git",
        "/opt/homebrew/bin/git",
        "/opt/homebrew/opt/git/bin/git",
        "/usr/local/Cellar/git/bin/git",
    ];
    for raw in &known_paths {
        let p = PathBuf::from(raw);
        if p.exists() {
            return Some(p);
        }
    }

    // 尝试在现有 PATH 中搜索
    if let Some(path_env) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_env) {
            let candidate = dir.join("git");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    // macOS: 通过 path_helper 获取完整 PATH
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("/usr/libexec/path_helper").arg("-s").output() {
            if output.status.success() {
                let s = String::from_utf8_lossy(&output.stdout);
                // 解析 PATH="..."; 格式
                if let Some(start) = s.find("PATH=\"") {
                    let rest = &s[start + 6..];
                    if let Some(end) = rest.find('"') {
                        let path_val = &rest[..end];
                        for dir in std::env::split_paths(path_val) {
                            let candidate = dir.join("git");
                            if candidate.exists() {
                                return Some(candidate);
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// 检测系统 git 是否已安装且可用
///
/// 返回 { installed: bool, version: Option<String> }
#[tauri::command]
pub fn xingjing_check_git_installed() -> serde_json::Value {
    // 先尝试找到具体路径
    if let Some(git_bin) = find_git_binary() {
        if let Ok(out) = Command::new(&git_bin).arg("--version").output() {
            if out.status.success() {
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                return serde_json::json!({ "installed": true, "version": version });
            }
        }
    }
    // 尝试直接调用 git（靠 PATH 解析）
    match Command::new("git").arg("--version").output() {
        Ok(out) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            serde_json::json!({ "installed": true, "version": version })
        }
        _ => serde_json::json!({ "installed": false }),
    }
}

/// 尝试找到 brew 可执行文件
#[cfg(target_os = "macos")]
fn find_brew_binary() -> Option<PathBuf> {
    let known = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
    for raw in &known {
        let p = PathBuf::from(raw);
        if p.exists() {
            return Some(p);
        }
    }
    if let Some(path_env) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_env) {
            let candidate = dir.join("brew");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

/// 安装 git（按操作系统自动选择包管理器）
///
/// macOS: brew install git
/// Windows: winget install Git.Git
/// Linux: apt-get / dnf / pacman
///
/// 返回 { ok: bool, output: String }
#[tauri::command]
pub fn xingjing_install_git() -> serde_json::Value {
    #[cfg(target_os = "macos")]
    {
        let brew = match find_brew_binary() {
            Some(p) => p,
            None => {
                return serde_json::json!({
                    "ok": false,
                    "output": "未找到 Homebrew。请先安装 Homebrew：https://brew.sh"
                });
            }
        };
        match Command::new(&brew).args(["install", "git"]).output() {
            Ok(out) => {
                let combined = format!(
                    "{}{}",
                    String::from_utf8_lossy(&out.stdout),
                    String::from_utf8_lossy(&out.stderr)
                );
                if out.status.success() {
                    serde_json::json!({ "ok": true, "output": combined })
                } else {
                    serde_json::json!({ "ok": false, "output": combined })
                }
            }
            Err(e) => serde_json::json!({ "ok": false, "output": format!("执行 brew 失败: {e}") }),
        }
    }

    #[cfg(target_os = "windows")]
    {
        match Command::new("winget")
            .args(["install", "--id", "Git.Git", "-e", "--source", "winget"])
            .output()
        {
            Ok(out) => {
                let combined = format!(
                    "{}{}",
                    String::from_utf8_lossy(&out.stdout),
                    String::from_utf8_lossy(&out.stderr)
                );
                if out.status.success() {
                    serde_json::json!({ "ok": true, "output": combined })
                } else {
                    serde_json::json!({ "ok": false, "output": combined })
                }
            }
            Err(e) => serde_json::json!({ "ok": false, "output": format!("执行 winget 失败: {e}") }),
        }
    }

    #[cfg(target_os = "linux")]
    {
        // 逐一尝试 apt-get 、dnf 、pacman
        let managers: &[(&str, &[&str])] = &[
            ("apt-get", &["-y", "install", "git"]),
            ("dnf", &["-y", "install", "git"]),
            ("pacman", &["-S", "--noconfirm", "git"]),
        ];
        for (mgr, args) in managers {
            match Command::new(mgr).args(*args).output() {
                Ok(out) => {
                    let combined = format!(
                        "{}{}",
                        String::from_utf8_lossy(&out.stdout),
                        String::from_utf8_lossy(&out.stderr)
                    );
                    if out.status.success() {
                        return serde_json::json!({ "ok": true, "output": combined });
                    }
                    // 尝试下一个包管理器
                }
                Err(_) => continue,
            }
        }
        serde_json::json!({
            "ok": false,
            "output": "未找到可用的包管理器（apt-get/dnf/pacman）"
        })
    }

    // 其他平台 fallback
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        serde_json::json!({ "ok": false, "output": "当前平台暂不支持自动安装 git" })
    }
}

/// 将一行文本追加写入 ~/.xingjing/logs/agent-calls-YYYY-MM-DD.log
/// 自动创建目录及文件，写入失败时返回错误信息（日志为尽力而为，调用方可静默忽略）。
#[tauri::command]
pub fn xingjing_append_log(line: String) -> Result<(), String> {
    use std::io::Write;

    let Some(home) = home_dir() else {
        return Err("无法获取 HOME 目录".to_string());
    };

    let log_dir = home.join(".xingjing").join("logs");
    fs::create_dir_all(&log_dir)
        .map_err(|e| format!("创建日志目录失败: {e}"))?;

    // 按天生成文件名（UTC）
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days_since_epoch = now / 86400;
    let date_str = epoch_days_to_date_str(days_since_epoch);

    let log_file = log_dir.join(format!("agent-calls-{date_str}.log"));

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("打开日志文件失败: {e}"))?;

    writeln!(file, "{line}")
        .map_err(|e| format!("写入日志失败: {e}"))?;

    Ok(())
}

/// 将从 epoch 起的天数转为 "YYYY-MM-DD" 字符串（UTC）
fn epoch_days_to_date_str(days: u64) -> String {
    let mut remaining = days;
    let mut year = 1970u64;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        year += 1;
    }
    let months = if is_leap(year) {
        [31u64, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31u64, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1u64;
    for days_in_month in months {
        if remaining < days_in_month {
            break;
        }
        remaining -= days_in_month;
        month += 1;
    }
    let day = remaining + 1;
    format!("{year:04}-{month:02}-{day:02}")
}

fn is_leap(year: u64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}
