const fs = require('fs');
const path = require('path');

// 定义errors目录路径
const errorsDir = path.join(__dirname);

// 读取errors目录下所有的HTML文件
const htmlFiles = fs.readdirSync(errorsDir).filter(file => file.endsWith('.html'));

// 遍历每个HTML文件并进行修改
htmlFiles.forEach(file => {
    const filePath = path.join(errorsDir, file);
    console.log(`Processing file: ${file}`);
    
    // 读取文件内容
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 1. 检查是否已经有游戏入口提示
    if (!content.includes('要想在等待时玩游戏吗？')) {
        // 找到错误信息段落，在其后面添加游戏入口提示
        if (content.includes('class="error-message"')) {
            // 匹配error-message段落
            content = content.replace(/(<p class="error-message"[^>]*>[\s\S]*?<\/p>)/g, '$1\n        <p class="error-description" data-aos="fade-up" data-aos-duration="1000" data-aos-delay="550">\n            要想在等待时玩游戏吗？\n        </p>');
        } else if (content.includes('class="error-description"')) {
            // 匹配error-description段落
            content = content.replace(/(<p class="error-description"[^>]*>[\s\S]*?<\/p>)/g, '$1\n        <p class="error-description" data-aos="fade-up" data-aos-duration="1000" data-aos-delay="550">\n            要想在等待时玩游戏吗？\n        </p>');
        } else if (content.includes('class="error-examples"')) {
            // 匹配error-examples段落
            content = content.replace(/(<div class="error-examples"[^>]*>[\s\S]*?<\/div>)/g, '$1\n        <p class="error-description" data-aos="fade-up" data-aos-duration="1000" data-aos-delay="550">\n            要想在等待时玩游戏吗？\n        </p>');
        }
    }
    
    // 2. 确保btn-group中的按钮顺序正确：刷新按钮在前，立即启动按钮在后
    if (content.includes('class="btn-group"')) {
        // 找到btn-group
        const btnGroupMatch = content.match(/(<div class="btn-group"[^>]*>)([\s\S]*?)(<\/div>)/);
        if (btnGroupMatch) {
            const btnGroupStart = btnGroupMatch[1];
            const btnGroupEnd = btnGroupMatch[3];
            
            // 构建新的btn-group内容
            let newBtnGroupContent = '';
            
            // 添加刷新按钮
            newBtnGroupContent += '\n            <button class="btn btn-primary" onclick="location.reload()">刷新</button>';
            
            // 添加立即启动按钮
            newBtnGroupContent += '\n            <a href="./chrome-dinosaur-game/index.html" class="btn btn-secondary" target="_blank">立即启动</a>';
            
            // 替换原有的btn-group内容
            content = content.replace(/(<div class="btn-group"[^>]*>)([\s\S]*?)(<\/div>)/, btnGroupStart + newBtnGroupContent + '\n        ' + btnGroupEnd);
        }
    } else {
        // 如果没有btn-group，创建一个新的
        if (content.includes('要想在等待时玩游戏吗？')) {
            content = content.replace(/(<p class="error-description"[^>]*>要想在等待时玩游戏吗？<\/p>)/g, '$1\n        <div class="btn-group" data-aos="fade-up" data-aos-duration="1000" data-aos-delay="600">\n            <button class="btn btn-primary" onclick="location.reload()">刷新</button>\n            <a href="./chrome-dinosaur-game/index.html" class="btn btn-secondary" target="_blank">立即启动</a>\n        </div>');
        } else if (content.includes('class="error-message"')) {
            content = content.replace(/(<p class="error-message"[^>]*>[\s\S]*?<\/p>)/g, '$1\n        <div class="btn-group" data-aos="fade-up" data-aos-duration="1000" data-aos-delay="600">\n            <button class="btn btn-primary" onclick="location.reload()">刷新</button>\n            <a href="./chrome-dinosaur-game/index.html" class="btn btn-secondary" target="_blank">立即启动</a>\n        </div>');
        } else if (content.includes('class="error-examples"')) {
            content = content.replace(/(<div class="error-examples"[^>]*>[\s\S]*?<\/div>)/g, '$1\n        <div class="btn-group" data-aos="fade-up" data-aos-duration="1000" data-aos-delay="600">\n            <button class="btn btn-primary" onclick="location.reload()">刷新</button>\n            <a href="./chrome-dinosaur-game/index.html" class="btn btn-secondary" target="_blank">立即启动</a>\n        </div>');
        }
    }
    
    // 3. 确保立即启动按钮在新标签页打开
    content = content.replace(/<a href=".\/chrome-dinosaur-game\/index\.html" class="btn btn-secondary">立即启动<\/a>/g, '<a href="./chrome-dinosaur-game/index.html" class="btn btn-secondary" target="_blank">立即启动</a>');
    
    // 写入修改后的内容
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Modified file: ${file}`);
});

console.log('All HTML files have been processed successfully!');
