import { MediaPlayer } from 'dashjs';
import * as THREE from 'three';
import TIMINGSRC from 'TIMINGSRC';
import MCorp from 'MCorp';
import SimpleLinearRegression from 'ml-regression-simple-linear';
import { Chart } from '@antv/g2';


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

        this.x = 0;
        this.y = 0;

        this.loadedTileId = -1; // TODO 临时的，记录上次已经加载的tile

        this.detectCounter = 0;

        this.createEnhanceLay();
        this.initSelectedButton();

        this.trace = [];
        this.chart = null;
        this.time = 0;
        this._renderChart()
        this.traceX = [];
        this.traceY = [];
        this.traceT = [];
        this.predictX = [];
        this.predictY = [];
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
        this.chart.changeData(this.trace);
    }


    _renderChart = () => {
        // Step 1: 创建 Chart 对象
        let chart = new Chart({
            container: 'c1', // 指定图表容器 ID
            width: 1200, // 指定图表宽度
            height: 300, // 指定图表高度
            autoFit: true,
        });

        // Step 2: 载入数据源
        chart.data(this.trace);

        // Step 3: 创建图形语法，绘制柱状图
        chart.scale({
            time: {
                range: [0, 1],
                alias: '时间'
            },
            x: {
                alias: 'x坐标',
                min: 0,
                nice: true,
                max: 1
            },
            y: {
                alias: 'y坐标',
                min: 0,
                nice: true,
                max: 1
            },
            px: {
                alias: 'x预测',
                min: 0,
                nice: true,
                max: 1
            },
            py: {
                alias: 'y预测',
                min: 0,
                nice: true,
                max: 1
            },
            errX: {
                alias: 'x预测MAE',
                min: 0,
                nice: true,
                max: 0.5
            },
            errY: {
                alias: 'y预测MAE',
                min: 0,
                nice: true,
                max: 0.5
            }
        });
        chart.axis('time', {
            title: {}
        });
        chart.axis('x', {
            title: {}
        });
        chart.axis('y', {
            title: {}
        });
        chart.axis('px', {
            title: {}
        });
        chart.axis('py', {
            title: {}
        });
        chart.axis('errX', {
            title: {}
        });
        chart.axis('errY', {
            title: {}
        });
        chart.tooltip({
            showCrosshairs: true, // 展示 Tooltip 辅助线
            shared: true,
        });
        chart.legend({
            custom: 'true',
            items: [
                { name: 'x', value: 'x', marker: { symbol: 'line', style: { stroke: '#1890ff', lineWidth: 2 } } },
                { name: 'y', value: 'y', marker: { symbol: 'line', style: { stroke: '#ff00ff', lineWidth: 2 } } },
                { name: 'predictX', value: 'px', marker: { symbol: 'line', style: { stroke: '#80ff00', lineWidth: 2 } } },
                { name: 'predictY', value: 'py', marker: { symbol: 'line', style: { stroke: '#ff0000', lineWidth: 2 } } },
                { name: 'errorX', value: 'errX', marker: { symbol: 'line', style: { stroke: '#ffff00', lineWidth: 2 } } },
                { name: 'errorY', value: 'errY', marker: { symbol: 'line', style: { stroke: '#ff8000', lineWidth: 2 } } },

            ],
        });
        chart.line().position('time*x').color('#1890ff');
        chart.line().position('time*y').color('#ff00ff');
        chart.line().position('time*px').color('#80ff00');
        chart.line().position('time*py').color('#ff0000');
        chart.line().position('time*errX').color('#ffff00');
        chart.line().position('time*errY').color('#ff8000');
        // Step 4: 渲染图表
        chart.render();
        this.chart = chart;
    }

    initSelectedButton = () => {
        let ids = [
            'tile0-0', 'tile1-0', 'tile2-0', 'tile3-0',
            'tile0-1', 'tile1-1', 'tile2-1', 'tile3-1',
            'tile0-2', 'tile1-2', 'tile2-2', 'tile3-2'
        ]
        this.selected = [
            false, false, false, false,
            false, false, false, false,
            false, false, false, false
        ]
        this.isReady = [
            false, false, false, false,
            false, false, false, false,
            false, false, false, false
        ]
        this.tileCenter = [
            [0.167, 0.125], [0.167, 0.375], [0.167, 0.625], [0.167, 0.875],
            [0.5, 0.125], [0.5, 0.375], [0.5, 0.625], [0.5, 0.875],
            [0.833, 0.125], [0.833, 0.375], [0.833, 0.625], [0.833, 0.875]
        ]
        for (let i = 0; i < ids.length; i++) {
            let button = document.getElementById(ids[i]);
            button.onclick = () => {
                this.onTileButtonClick(i);
            }
            this.buttons.push(button);
        }
    }

    onTileButtonClick = (i) => {
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
                this.unloadTile(i);
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
                this.loadTile(i, 1);
            }
            buffer_add.onclick = null;
            buffer_diff.onclick = null;
            level_add.onclick = null;
            level_diff.onclick = null;
        }
    }

    /**
     * @function
     * @name TiledStreaming#loadTile
     * @param {number} id , tile分开的编号  
     * @param {number} level, 加载分块的质量级别 
     */
    loadTile = (id, level) => {
        let video = document.createElement('video');
        video.style.background = 'black';
        video.currentTime = this.baseVideo.currentTime;
        video.oncanplay = () => {
            this.isReady[id] = true;
        }
        this.initVideoNode(video, 320, 180);
        this.enhanceVideos[id] = video;
        let dash = MediaPlayer().create();
        dash.initialize(video, this.resUrls[id + 1], true);
        video.load();
        video.play();
        this.enhanceDash[id] = dash;
        let asyn = new MCorp.mediaSync(this.enhanceVideos[id], this.timingAsynSrc);
        this.videoMediaAsyns[id] = asyn;
        this.selected[id] = true;
    }

    /**
     * @function
     * @name TiledStreaming#unloadTile
     * @param {number} id, 写在分块的编号 
     */
    unloadTile = (id) => {
        let videoNode = this.enhanceVideos[id];
        videoNode.pause();
        let dash = this.enhanceDash[id];
        dash.reset();
        this.enhanceDash[id] = null;
        this.videoMediaAsyns[id] = null;
        this.isReady[id] = false;
        this.selected[id] = false;
    }

    createEnhanceLay = () => {
        for (let i = 0; i < 12; i++) {
            this.enhanceVideos.push(null);
            this.enhanceDash.push(null);
            this.videoMediaAsyns.push(null);
        }
    }

    loadTiledDash = (resUrls) => {
        this.resUrls = resUrls;
        this.baseDash = MediaPlayer().create();
        this.baseDash.initialize(this.baseVideo, resUrls[0], true);
        this.baseVideo.load();
        this.baseVideo.play();
        this.timingAsynSrc = new TIMINGSRC.TimingObject({
            position: this.baseVideo.currentTime,
        });
        this.initCanvas();
        return this.getTextureFromVideo();
    }

    getTextureFromVideo = () => {
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.needsUpdate = true;
        return this.texture;
    }

    initVideoNode = (videoInstance, width, height) => {
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
        videoInstance.addEventListener('canplay', this.onVideoStarted, false);
    }

    onVideoStarted = () => {
        if (this.timingAsynSrc) {
            this.timingAsynSrc.update({
                position: this.baseVideo.currentTime,
                velocity: 1.0
            });
        }
    }

    initCanvas = () => {
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

    updateCanvas = () => {
        if (!this.ctx) {
            return;
        }
        this.ctx.strokeStyle = "rgb(102, 255, 102)";
        this.ctx.drawImage(this.baseVideo, 0, 0, 1024, 512);
        if (this.selected[0] && this.isReady[0]) {
            this.ctx.drawImage(this.enhanceVideos[0], 0, 0, 256, 170);
            this.ctx.strokeRect(0, 0, 256, 170);
        }
        if (this.selected[1] && this.isReady[1]) {
            this.ctx.drawImage(this.enhanceVideos[1], 256, 0, 256, 170);
            this.ctx.strokeRect(256, 0, 256, 170);
        }
        if (this.selected[2] && this.isReady[2]) {
            this.ctx.drawImage(this.enhanceVideos[2], 512, 0, 256, 170);
            this.ctx.strokeRect(512, 0, 256, 170);
        }
        if (this.selected[3] && this.isReady[3]) {
            this.ctx.drawImage(this.enhanceVideos[3], 768, 0, 256, 170);
            this.ctx.strokeRect(768, 0, 256, 170);
        }
        if (this.selected[4] && this.isReady[4]) {
            this.ctx.drawImage(this.enhanceVideos[4], 0, 170, 256, 170);
            this.ctx.strokeRect(0, 170, 256, 170);
        }
        if (this.selected[5] && this.isReady[5]) {
            this.ctx.drawImage(this.enhanceVideos[5], 256, 170, 256, 170);
            this.ctx.strokeRect(256, 170, 256, 170);
        }
        if (this.selected[6] && this.isReady[6]) {
            this.ctx.drawImage(this.enhanceVideos[6], 512, 170, 256, 170);
            this.ctx.strokeRect(512, 170, 256, 170);
        }
        if (this.selected[7] && this.isReady[7]) {
            this.ctx.drawImage(this.enhanceVideos[7], 768, 170, 256, 170);
            this.ctx.strokeRect(768, 170, 256, 170);
        }
        if (this.selected[8] && this.isReady[8]) {
            this.ctx.drawImage(this.enhanceVideos[8], 0, 340, 256, 170);
            this.ctx.strokeRect(0, 340, 256, 170);
        }
        if (this.selected[9] && this.isReady[9]) {
            this.ctx.drawImage(this.enhanceVideos[9], 256, 340, 256, 170);
            this.ctx.strokeRect(256, 340, 256, 170);
        }
        if (this.selected[10] && this.isReady[10]) {
            this.ctx.drawImage(this.enhanceVideos[10], 512, 340, 256, 170);
            this.ctx.strokeRect(512, 340, 256, 170);
        }
        if (this.selected[11] && this.isReady[11]) {
            this.ctx.drawImage(this.enhanceVideos[11], 768, 340, 256, 170);
            this.ctx.strokeRect(768, 340, 256, 170);
        }
    }

    update = () => {
        this.updateCanvas();
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
     * @name TiledStreaming#
     * @description
     */
    onCameraPositionUpdate = (lat, lon) => {
        this.updateCameraPosXY(lat, lon);
        if (this.detectCounter < 5) {
            this.detectCounter++;
            this.traceT.push(this.detectCounter);
            this.traceX.push(this.x);
            this.traceY.push(this.y);
            if (this.detectCounter >= this.predictX.length) {
                return;
            }
            this.errorX += Math.abs(this.x - this.predictX[this.detectCounter]);
            this.errorY += Math.abs(this.y - this.predictY[this.detectCounter]);
            this.errorCount++;
            return;
        } else {
            this.detectCounter = 0;
            // 执行线性回归预测
            console.log('X的预测MAE=', this.errorX / this.errorCount);
            console.log('Y的预测MAE=', this.errorY / this.errorCount);;
            const regressionX = new SimpleLinearRegression(this.traceT, this.traceX);
            const regressionY = new SimpleLinearRegression(this.traceT, this.traceY);
            this.px = this.predictX[this.predictX.length - 1];
            this.py = this.predictY[this.predictX.length - 1];
            this.predictX = [];
            this.predictY = [];
            for (let i = 5; i < 10; i++) {
                this.predictX.push(regressionX.predict(i));
                this.predictY.push(regressionY.predict(i));
            }
            this.traceT = [];
            this.traceX = [];
            this.traceY = [];
        }
        for (let i = 0; i < this.tileCenter.length; i++) {
            let disSqure = this.getCenterDistanceSqure(i);
            if (disSqure <= 0.1) {
                if (this.selected[i] !== true) {
                    this.loadTile(i, 1);
                }
            } else {
                if (this.selected[i] === true) {
                    this.unloadTile(i);
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
    updateCameraPosXY = (lat, lon) => {
        this.x = (180 - lat) / 180;
        this.y = (lon + 180) / 360;
    }
    getCenterDistanceSqure = (id) => {
        let tileX = this.tileCenter[id][0];
        let tileY = this.tileCenter[id][1];
        return Math.pow(this.x - tileX, 2) + Math.pow(this.y - tileY, 2);
    }
}

export default TiledStreaming;