import {MediaPlayer} from 'dashjs';
import * as THREE from 'three';
import TIMINGSRC from 'TIMINGSRC';
import MCorp from 'MCorp';
import CameraChart from './charts/CameraChart';

/**
 * @class
 * @description 基于Dash-SRD实现全景视频的分块传输，实验特性
 */
class TiledStreaming {

	constructor(baseVideo) {
		this.baseVideo = baseVideo;
		this.baseDash = null;
		this.enhanceVideos = [];
		this.enhanceDash = [];
		this.videoMediaAsyns = [];
		this.canvas = null;
		this.timingAsynSrc = null;
		this.buttons = [];
		this.selected = []; // 某个块是否被选中，后期需要升级为被选中哪个版本的块
		this.isReady = [];  // 该块的视频是否加载成功
		this.resUrls = [];
		this.rows = null;
		this.cols = null;

		this.x = 0;
		this.y = 0;

		this.loadedTileId = -1; // TODO 临时的，记录上次已经加载的tile

		this.detectCounter = 0;


		this.trace = [];
		this.cameraChart = null;
		this.time = 0;
		this.traceX = [];
		this.traceY = [];
		this.traceT = [];
		this.predictPoints = [];
		this.px = 0;
		this.py = 0;
		this.errorX = 0;
		this.errorY = 0;
		this.errorCount = 0;
		this.predictChart = null;
	}

	_updateChart = () => {
		this.trace.push({
			time: this.time,
			x: this.x,
			y: this.y,
			px: this.px,
			py: this.py,
			errX: this.errorX / this.errorCount,
			errY: this.errorY / this.errorCount
		})
		if (this.trace.length > 100) {
			this.trace = this.trace.slice(this.trace.length - 100, this.trace.length);
		}
		this.time++;
		if (this.cameraChart === null) {
			this.cameraChart = new CameraChart(this.trace);
		} else {
			this.cameraChart.updateData(this.trace);
		}
	}

	_initSelectedButton = (rows, cols) => {
		let ids = [];
		for (let i = 0; i < rows; i++) {
			for (let j = 0; j < cols; j++) {
				let idName = 'tile' + i + '-' + j;
				ids.push(idName);
			}
		}
		this.selected = [];
		for (let i = 0; i < (rows * cols); i++) {
			this.selected.push(false)
		}
		this.isReady = [];
		for (let i = 0; i < (rows * cols); i++) {
			this.isReady.push(false)
		}
		let unitWidth = 0.5 / cols;
		let unitHeight = 0.5 / rows;
		this.tileCenters = [];
		for (let i = 0; i < cols; i++) {
			for (let j = 0; j < rows; j++) {
				let x = unitWidth * 2 * i + unitWidth;
				let y = unitHeight * 2 * j + unitHeight;
				let point = [x, y];
				this.tileCenters.push(point);
			}
		}
		for (let i = 0; i < ids.length; i++) {
			let button = document.getElementById(ids[i]);
			button.onclick = () => {
				this._onTileButtonClick(i);
			}
			this.buttons.push(button);
		}
	}

	_onTileButtonClick = (i) => {
		let tile_selected_info = document.getElementById('tile_selected_info');
		let buffer_info = document.getElementById('buffer_info');
		let level_info = document.getElementById('level_info');
		let throughput = document.getElementById('throughput');
		let tile_unselected = document.getElementById('tile_unselected');
		let tile_selected = document.getElementById('tile_selected');
		let buffer_add = document.getElementById('buffer++');
		let buffer_diff = document.getElementById('buffer--');
		let level_add = document.getElementById('level++');
		let level_diff = document.getElementById('level--');
		let level_list = document.getElementById('level_list');
		if (this.selected[i]) {
			tile_selected_info.innerHTML = "selected:true";
			buffer_info.innerHTML = 'buffer:' + this.enhanceDash[i].getBufferLength('video');
			level_info.innerHTML = 'level:' + this.enhanceDash[i].getQualityFor('video');
			throughput.innerHTML = 'throughput:' + this.enhanceDash[i].getAverageThroughput('video');
			let levelList = 'bitrates:';
			let bitrateList = this.enhanceDash[i].getActiveStream().getBitrateListFor('video');
			for (let i = 0; i < bitrateList.length; i++) {
				levelList += `${bitrateList[i].bitrate}(${bitrateList[i].width}x${bitrateList[i].height}) `;
			}
			level_list.innerHTML = levelList;
			tile_unselected.onclick = () => {
				this._unloadTile(i);
			}
			tile_selected.onclick = null;
			buffer_add.onclick = () => {

			}
			buffer_diff.onclick = () => {

			}
			level_add.onclick = () => {
				let curr = this.enhanceDash[i].getQualityFor('video');
				this.enhanceDash[i].setQualityFor('video', curr++);
			}
			level_diff.onclick = () => {
				let curr = this.enhanceDash[i].getQualityFor('video');
				this.enhanceDash[i].setQualityFor('video', curr--);
			}
		} else {
			tile_selected_info.innerHTML = 'selected:false';
			buffer_info.innerHTML = 'buffer:null';
			level_info.innerHTML = 'level:null';
			throughput.innerHTML = 'throughput:null';
			level_list.innerHTML = 'bitrates:null';
			tile_unselected.onclick = null;
			tile_selected.onclick = () => {
				this._loadTile(i, 1);
			}
			buffer_add.onclick = null;
			buffer_diff.onclick = null;
			level_add.onclick = null;
			level_diff.onclick = null;
		}
	}

	/**
	 * @function
	 * @name TiledStreaming#_loadTile
	 * @param {number} id , tile分开的编号
	 * @param {number} level, 加载分块的质量级别
	 */
	_loadTile = (id, level) => {
		// 动态创建视频
		if (this.enhanceVideos[id] === null) {
			let video = document.createElement('video');
			video.style.background = 'black';
			video.oncanplay = () => {
				this.isReady[id] = true;
			}
			this._initVideoNode(video, 320, 180);
			this.enhanceVideos[id] = video;
			video.load();
			// TODO 测试，底层使用播放情况
			// let panel = document.getElementById('operation');
			// panel.appendChild(video);
		}
		// 动态创建Dash
		let video = this.enhanceVideos[id];
		if (this.enhanceDash[id] === null) {
			let dash = MediaPlayer().create();
			dash.initialize(video, this.resUrls[id + 1], true);
			dash.updateSettings({
				'streaming': {
					'stableBufferTime': 3, // 一般质量下，稳定期的buffer大小
					'bufferTimeAtTopQuality': 5, // 如果使用的是最高质量，给予其更高的buffer长度
					'bufferTimeAtTopQualityLongForm': 20, // 当内容被判断为LongForm时，最高质量给予的buffer长度
					'longFormContentDurationThreshold': 200, // 多长被判断为long form内容
					'scheduleWhilePaused': false,            // 当播放pause时，阻止后台下载
					'fastSwitchEnabled': true,               // 当视频的quality发生up时，清空之后的buffer，换取最新版本的内容
				}
			});
			this.enhanceDash[id] = dash;
		}
		video.currentTime = this.baseVideo.currentTime;
		video.play();
		// 动态创建同步器
		if (this.videoMediaAsyns[id] === null) {
			this.videoMediaAsyns[id] = new MCorp.mediaSync(this.enhanceVideos[id], this.timingAsynSrc);
		} else {
			this.videoMediaAsyns[id].pause(false);
		}
		this.selected[id] = true;
	}

	/**
	 * @function
	 * @name TiledStreaming#_unloadTile
	 * @param {number} id, 写在分块的编号
	 */
	_unloadTile = (id) => {
		let videoNode = this.enhanceVideos[id];
		videoNode.pause();
		let dash = this.enhanceDash[id];
		dash.pause();
		// TODO 阻止dash的继续下载
		this.videoMediaAsyns[id].pause(true);
		this.isReady[id] = false;
		this.selected[id] = false;
	}

	_createEnhanceLay = (num) => {
		for (let i = 0; i < num; i++) {
			this.enhanceVideos.push(null);
			this.enhanceDash.push(null);
			this.videoMediaAsyns.push(null);
		}
	}

	loadTiledDash = (resUrls, rows, cols) => {
		this.resUrls = resUrls;
		this.rows = rows;
		this.cols = cols;
		this.baseDash = MediaPlayer().create();
		this.baseDash.initialize(this.baseVideo, resUrls[0], true);
		this.baseDash.updateSettings({
			'fastSwitchEnabled': true,      // 黑块率较高的清空下，基础流也是需要提升质量的
			'stableBufferTime': 30,         // buffer尽可能的长
			'bufferTimeAtTopQuality': 60,   // 最高质量不用担心rebuffer，所以可以尽可能的给较长的buffer
			'bufferTimeAtTopQualityLongForm': 120,
			'longFormContentDurationThreshold': 200,
		});
		this.baseVideo.load();
		this.baseVideo.play();
		this.timingAsynSrc = new TIMINGSRC.TimingObject({
			position: this.baseVideo.currentTime,
		});
		this._initCanvas();
		this._createEnhanceLay(rows * cols);
		this._initSelectedButton(rows, cols);
		return this._getTextureFromVideo();
	}

	_getTextureFromVideo = () => {
		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.needsUpdate = true;
		return this.texture;
	}

	_initVideoNode = (videoInstance, width, height) => {
		videoInstance.width = width;
		videoInstance.height = height;
		videoInstance.loop = true;
		videoInstance.crossOrigin = "anonymous";
		videoInstance.autoplay = true;
		videoInstance.muted = true;
		videoInstance.allowsInlineMediaPlayback = true;
		videoInstance.setAttribute('webkit-playsinline', 'webkit-playsinline');
		videoInstance.setAttribute('webkit-playsinline', true);
		videoInstance.setAttribute('playsinline', true)
		videoInstance.setAttribute('preload', 'auto')
		videoInstance.setAttribute('x-webkit-airplay', 'allow')
		videoInstance.setAttribute('x5-playsinline', true)
		videoInstance.setAttribute('x5-video-player-type', 'h5')
		videoInstance.setAttribute('x5-video-player-fullscreen', true)
		videoInstance.setAttribute('x5-video-orientation', 'portrait')
		videoInstance.setAttribute('style', 'object-fit: fill')
		videoInstance.setAttribute('loop', "loop")
		videoInstance.addEventListener('canplay', this._onVideoStarted, false);
	}

	_onVideoStarted = () => {
		if (this.timingAsynSrc) {
			this.timingAsynSrc.update({
				position: this.baseVideo.currentTime,
				velocity: 1.0
			});
		}
	}

	_initCanvas = () => {
		this.canvas = document.createElement('canvas');
		this.canvas.width = 2048;
		this.canvas.height = 1024;
		this.canvas.style.width = '1024px';
		this.canvas.style.height = '512px';
		// TODO 测试使用
		let xrContainer = document.getElementById("operation");
		xrContainer.appendChild(this.canvas);
		this.ctx = this.canvas.getContext("2d");
		this.ctx.scale(2, 2);
		this.ctx.imageSmoothingQuality = "high";
	}

	_updateCanvas = () => {
		if (!this.ctx) {
			return;
		}
		this.ctx.strokeStyle = "rgb(102, 255, 102)";
		this.ctx.drawImage(this.baseVideo, 0, 0, 1024, 512);

		for (let i = 0; i < this.cols; i++) {
			let width = 1024 / this.rows;
			let height = 512 / this.cols;
			for (let j = 0; j < this.rows; j++) {
				let index = j + i * this.rows;
				if (this.selected[index] && this.isReady[index]) {
					this.ctx.drawImage(this.enhanceVideos[index], j * width, i * height, width, height);
					this.ctx.strokeRect(j * width, i * height, width, height);
				}
			}
		}
	}

	update = () => {
		this._updateCanvas();
		if (this.texture) {
			this.texture.needsUpdate = true;
		}
	}

	play = () => {
	}

	pause = () => {

	}

	reset = () => {

	}

	/**
	 * @function
	 * @name TiledStreaming#onCameraPositionUpdate
	 * @description invoke when camera place changes
	 */
	onCameraPositionUpdate = (lat, lon, predictPoints, isPredicted) => {
		// update camera place parameter: x, y
		this._updateCameraPosXY(lat, lon);

		this.predictPoints = predictPoints;

		// iterate all tiles and decide load or unload
		// according to distance with camera center
		for (let i = 0; i < this.tileCenters.length; i++) {
			let distance = this._getCenterDistanceSquare(i, isPredicted);
			if (distance <= 0.1) {
				if (this.selected[i] !== true) {
					this._loadTile(i, 1);
				}
			} else {
				if (this.selected[i] === true) {
					this._unloadTile(i);
				}
			}
		}
		// TODO 优化这里的分块选择逻辑，目前只是简单的通过视点中心位置来选择
		// 与视点中心的距离
		// 预测可能性，预测未来窗口时长，预测准确度
		// 黑块率：各个块的质量要均衡
		// 与以选择块的质量差
		this._updateChart();
	}

	_updateCameraPosXY = (lat, lon) => {
		this.x = (180 - lat) / 180;
		this.y = (lon + 180) / 360;
	}

	_getCenterDistanceSquare = (id, isPredicted) => {
		let tileX = this.tileCenters[id][0];
		let tileY = this.tileCenters[id][1];
		if (!isPredicted) {
			return Math.pow(this.x - tileX, 2) + Math.pow(this.y - tileY, 2);
		} else {
			// TODO
			return null;
		}
	}

	/**
	 * @function
	 * @name TiledStreaming#getDashBufferList
	 * @description 获取所有dash实例的buffer列表，最后一个是基础层流的buffer
	 */
	getDashBufferList = () => {
		let bufferList = [];
		this.enhanceDash.forEach(dash => {
			if (dash == null) {
				bufferList.push(0);
			} else {
				bufferList.push(dash.getBufferLength('video'));
			}
		});
		if (this.baseDash != null) {
			bufferList.push(this.baseDash.getBufferLength('video'));
		}
		return bufferList;
	}
}

export default TiledStreaming;