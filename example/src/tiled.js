import React from "react";
import XRPlayer from "../../src/index"; // 实际项目中使用，请使用如下方式
import BufferChart from "./charts/BufferChart";

class TiledDemo extends React.Component {
	state = {
		isFullScreen: false,
		onOrientationControls: false,
		isDataReady: false,
		operation_state: "none",
		camera_track_visible: false,
		buffer_chart_visible: false,
	};

	constructor(props) {
		super(props);
		this.xrManager = null;
		this.xrConfigure = {};
		this.rows = 4;
		this.cols = 3;
		fetch("/react-xrplayer/mock/view-tiled.json")
			.then((res) => {
				return res.json();
			})
			.then((json) => {
				console.log("json", json);
				this.xrConfigure = json;
				const res_urls = json.res_urls[0];
				this.rows = res_urls.rows;
				this.cols = res_urls.cols;
				this.setState({
					isDataReady: true,
				});
			});
		this.tileStreaming = null;
		this.bufferChart = null;
	}

	afterInit = () => {
		if (this.xrManager) {
			this.xrManager.connectCameraControl();
			this.xrManager.enableKeyControl(true);
			this.xrManager.onCameraPositionUpdate((pos) => {
				console.log("lat", pos.lat, "lon", pos.lon);
				if (this.tileStreaming === null) {
					return;
				}
				this.tileStreaming.onCameraPositionUpdate(pos.lat, pos.lon);
			});
			let textureHelper = this.xrManager.getSceneTextureHelper();
			this.tileStreaming = textureHelper.getTextureMediaSource();
		}
	}

	onXRCreated = (manager) => {
		this.xrManager = manager;
		if (navigator.xr === undefined) {
			console.warn("WebXR is not supported in this browser.");
			this.xrManager.init();
		} else {
			navigator.xr.isSessionSupported("immersive-vr").then((isSupported) => {
				if (isSupported) {
					console.log("WebXR is supported.");
					this.xrManager.enterImmersiveVR().then(() => {
						this.afterInit();
					});
				}
			})
		}
	};

	updateBufferData = () => {
		if (this.tileStreaming === null) {
			return;
		}
		let bufferList = this.tileStreaming.getDashBufferList();
		let data = [];
		let x = 2,
			y = 0;
		for (let i = 0; i < bufferList.length - 1; i++) {
			data.push({
				x: x,
				y: y,
				value: bufferList[i],
			});
			y++;
			if (y % 4 === 0) {
				x--;
				y = 0;
			}
		}
		data.push({
			x: 3,
			y: 0,
			value: bufferList[bufferList.length - 1],
		});
		if (this.bufferChart === null) {
			this.bufferChart = new BufferChart(data);
		} else {
			this.bufferChart.updateData(data);
		}
	};

	generateTileTable = (rows, cols) => {
		const tile_name_list = [];
		const tr_list = [];

		for (let i = 0; i < cols; i++) {
			for (let j = 0; j < rows; j++) {
				let name = "tile" + j + "-" + i;
				tile_name_list.push(name);
			}
		}

		let cnt = 0;
		for (let i = 0; i < cols; i++) {
			const btn_list = [];
			for (let j = 0; j < rows; j++) {
				let index = i * cols + j + cnt;
				let id = tile_name_list[index];
				btn_list.push(<button key={id.toString()} id={id}>{id}</button>)
			}
			cnt++;
			const tr = React.createElement("tr", {key: i}, btn_list);
			tr_list.push(tr);
		}

		return tr_list;
	}

	render() {
		const operation_state = this.state.operation_state;
		const camera_track_visible = this.state.camera_track_visible;
		const buffer_chart_visible = this.state.buffer_chart_visible;

		return (
			<div>
				{this.state.isDataReady ? (
					<XRPlayer
						width="100vw"
						height="100vh"
						camera_position={{
							x: 0,
							y: 10,
							z: 0,
						}}
						onCreated={this.onXRCreated}
						scene_texture_resource={this.xrConfigure.res_urls}
						axes_helper_display={false}
						camera_helper_display={true}
						is_full_screen={this.state.isFullScreen}
						onFullScreenChange={(isFull) => {
							this.setState({isFullScreen: isFull});
						}}
						onEventHandler={this.onEventHandler}
					/>
				) : (
					<div>加载中</div>
				)}
				{this.state.isDataReady ? (
					<div
						id="operation"
						style={{
							position: "fixed",
							bottom: "0",
							color: "white",
							visibility: operation_state === "tile" ? "visible" : "hidden",
						}}
					>
						<table>
							<tbody>
							<tr>
								<td>分块选择</td>
							</tr>
							{this.generateTileTable(this.rows, this.cols)}
							<tr>
								<td>
									分块操作
								</td>
							</tr>
							<tr>
								<td>
									<div>
										<button id="tile_selected">选择</button>
										<button id="tile_unselected">移除</button>
										<font id="tile_selected_info">selected:?</font>
									</div>
									<div>
										<button id="buffer++">buffer++</button>
										<button id="buffer--">buffer--</button>
										<font id="buffer_info">buffer:?</font>
									</div>
									<div>
										<button id="level++">level++</button>
										<button id="level--">level--</button>
										<font id="level_info">level:?</font>
									</div>
									<div>
										<font id="throughput">throughput:</font>
									</div>
									<div>
										<font id="level_list">levels:</font>
									</div>
								</td>
							</tr>
							</tbody>
						</table>
					</div>
				) : (
					<div>加载中</div>
				)}
				<div
					style={{
						position: "fixed",
						bottom: "0",
						width: "80%",
						display: operation_state === "chart" ? "block" : "none",
					}}
				>
					<div
						id="c1"
						style={{
							background: "white",
							display: camera_track_visible ? "block" : "none",
						}}
					/>
					<div
						id="c2"
						style={{
							background: "white",
							display: buffer_chart_visible ? "block" : "none",
						}}
					/>
					<button
						onClick={() => {
							setInterval(this.updateBufferData, 2000);
							this.setState({buffer_chart_visible: true});
						}}
					>
						开启buffer统计
					</button>
					<button
						onClick={() => {
							clearInterval(this.updateBufferData);
							this.setState({buffer_chart_visible: true});
						}}
					>
						关闭buffer统计
					</button>
					<button
						onClick={() => {
							this.setState({camera_track_visible: true});
						}}
					>
						展示Camera Track
					</button>
					<button
						onClick={() => {
							this.setState({camera_track_visible: false});
						}}
					>
						关闭Camera Track
					</button>
				</div>
				<div style={{position: "fixed", top: "0"}}>
					<button onClick={() => this.setState({operation_state: "tile"})}>
						分块
					</button>
					<button onClick={() => this.setState({operation_state: "chart"})}>
						图标
					</button>
					<button onClick={() => this.setState({operation_state: "none"})}>
						关闭
					</button>
					<button onClick={() => this.setState({isFullScreen: true})} >
						全屏
					</button>
				</div>
			</div>
		);
	}
}

export default TiledDemo;
