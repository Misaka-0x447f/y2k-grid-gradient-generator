该文件 `src/App.tsx` 是 **Y2K Grid Gradient Generator**（Y2K 风格网格渐变生成器）的核心实现文件。它是一个基于 React 的 Web 应用，允许用户通过配置颜色停靠点和网格参数来生成具有复古（Y2K/Win95）风格的网格渐变 SVG。

### 核心功能模块总结

#### 1. 状态管理与 URL 同步
- **状态初始化 (`getInitialState`)**: 从 URL 的 `config` 参数中读取 Base64 编码的 JSON 配置，若无则使用默认值。
- **持久化 (`useEffect`)**: 每当配置（宽高、颜色、网格大小等）改变时，自动将当前状态编码并更新到浏览器 URL 中，方便分享和保存。

#### 2. SVG 生成逻辑 (`generateGradientSVG`)
- **网格计算**: 根据设定的 `width`、`height` 和 `squareSize` 将画布划分为多个单元格。
- **渐变插值 (`getCellInfo`)**:
    - 基于用户定义的 `stops`（颜色停靠点）进行线性插值。
    - 使用 `smoothstep` 函数平滑过渡。
    - `isLargeEnd` 属性决定了方块是充满网格（前景色）还是缩小至消失（显示背景色）。
- **阶梯化缩放 (`sizeStep`)**: 支持按步长离散化方块大小，增加复古感。
- **性能优化 (矩形合并)**:
    - `mergeVertically` 和 `mergeHorizontally`: 将颜色和属性相同的相邻小矩形合并为大矩形，显著减少生成的 SVG 代码体积。

#### 3. 用户界面 (UI)
- **视觉风格**: 模仿 Windows 95/Classic 风格（灰底、立体边框、Tahoma 字体）。
- **设置面板**:
    - **Output Settings**: 调整画布宽高、网格大小（Square）、缩放步长（Step）和 CSS 选择器。
    - **Color Stops**: 动态添加/删除颜色点，设置位置、颜色和是否为“大端”（Large）。
- **预览区域**: 实时渲染生成的 SVG。
- **导出功能**:
    - **Download SVG**: 下载生成的 `.svg` 文件。
    - **Copy SVG**: 复制 SVG 源码。
    - **Copy JS Code**: 生成一段可以直接在网页中应用的 JavaScript 代码片段，通过 Data URL 将生成的渐变应用到指定 CSS 选择器。
