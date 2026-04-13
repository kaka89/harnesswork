use std::fs;
use std::path::PathBuf;

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
