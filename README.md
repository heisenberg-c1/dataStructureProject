# dataStructureProject

基于 React + Pixi + FastAPI 的平面路网与动态交通模拟项目。

## 1. 项目要求

### 1.1 功能目标

项目围绕二维平面连通图实现以下能力（F1-F5）：

- F1 局部地图显示：输入任意坐标，快速查询最近 100 个顶点及关联边。
- F2 地图缩放：支持缩放，在低缩放场景对密集点进行代表节点聚合，避免渲染拥挤与卡顿。
- F3 静态最短路径：按物理距离计算任意起终点最短路。
- F4 交通流模拟与可视化：边包含容量 v 与车辆数 n，动态耗时为 c * L * f(n/v)，并用颜色反映拥堵。
- F5 交通感知最短路径：按动态交通耗时规划路径。

### 1.2 技术栈

- 前端：TypeScript + React 19 + Pixi + shadcn + Tailwind CSS
- 后端：Python + FastAPI + NumPy + SciPy
- 通信：HTTP (RESTful API) + WebSocket

### 1.3 数据规模与约束

- 默认图规模：10000 顶点
- 图结构：二维平面连通图
- 连边策略：邻近点连边，边长度为欧几里得距离
- 交叉控制：基于 Delaunay Triangulation 生成合理平面路网

## 2. 项目结构

```text
datahomework/
├─ backend/                 # FastAPI + 图算法 + 交通模拟
│  ├─ app.py                # FastAPI 应用入口
│  ├─ api/                  # REST 与 WebSocket 路由
│  ├─ services/             # GraphEngine 核心门面
│  └─ core/                 # 算法核心
└─ frontend/                # React + Pixi 前端
	├─ src/api/              # HTTP 客户端与 WS 客户端
	├─ src/store/            # Zustand 状态管理
	└─ src/components/       # UI 与画布组件
```

## 3. 部署（本地开发环境）

### 3.1 环境要求

- Node.js >= 20
- npm >= 10
- Python >= 3.10（建议 3.11）

### 3.2 拉取代码

```bash
git clone <your-repo-url>
cd datahomework
```

### 3.3 部署后端依赖

Windows PowerShell:

```powershell
cd backend
python -m venv ..\.venv
..\.venv\Scripts\Activate.ps1
pip install -r requirement.txt
```


### 3.4 部署前端依赖

```bash
cd frontend
npm install
```

## 4. 运行（前后端联调）

建议开启两个终端分别运行后端与前端。

### 4.1 启动后端 FastAPI

```bash
cd backend
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

启动后可访问：

- 健康检查：http://127.0.0.1:8000/health
- Swagger 文档：http://127.0.0.1:8000/docs

### 4.2 启动前端 Vite

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

前端访问地址：http://127.0.0.1:5173


## 5. 关键接口说明

### 5.1 REST API

- GET /graph/meta：图元信息（顶点数、边数、边界）
- POST /graph/rebuild：按顶点数量重建图（10000-50000）
- GET /graph/nearby：查询坐标附近顶点与边
- POST /graph/shortest-path：静态最短路径
- GET /graph/traffic/state：交通状态快照
- POST /graph/shortest-path/traffic：交通感知最短路径

### 5.2 WebSocket

- WS /ws/traffic：实时推送交通状态


## 8. 常见问题

- 前端无法连后端：检查后端是否运行在 8000 端口，或确认 frontend/.env.local 配置是否正确。
- CORS 问题：后端已默认放行 5173 本地开发端口，若更换前端端口请同步修改 backend/app.py。