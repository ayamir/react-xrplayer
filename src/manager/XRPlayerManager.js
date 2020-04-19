/**
 * XR对外的交互通过Manager来提供
 */
import * as THREE from 'three';
import InnerViewControls from '../controls/InnerViewControls';
import SpriteShapeHelper from '../display/SpriteShapeHelper';
import CenterModelHelper from '../display/CenterModelHelper';
import TWEEN from '@tweenjs/tween.js';
import ViewConvertHelper from '../action/ViewConvertHelper';
import TextureHelper from '../texture/TextureHelper';
import SpriteParticleHelper from '../display/SpriteParticleHelper';
import VRHelper from "./VRHelper";

class XRPlayerManager {

    constructor(mount, initProps) {
        this.mount = mount;         // Threejs渲染挂载节点
        this.props = initProps;     // 初始化参数
        this.scene = null;
        this.sceneMesh = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.sceneContainer = null; // 全景背景挂载节点
        this.sceneTextureHelper = null; //全景场景纹理加载控制器

        this.handler = null;

        this.innerViewControls = null;
        this.spriteShapeHelper = null;
        this.spriteParticleHelper = null; // 粒子展示
        this.centerModelHelper = null;
        this.viewConvertHelper = null;
        this.spriteEventList = null;

        this.vrHelper = null;
        this.init();
    }

    init = () => {
        this.initCamera();
        this.initScene();
        this.initRenderer();
        this.initVR();
        this.animate(0);
        console.log('domElement', this.renderer.domElement.getBoundingClientRect().y);
    }

    initCamera = () => {
        const {
            camera_fov, camera_far, camera_near,
            camera_position: position, camera_target: target
        } = this.props;
        const camera = new THREE.PerspectiveCamera(
            camera_fov, this.mount.clientWidth / this.mount.clientHeight,
            camera_near, camera_far);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer = renderer;
        camera.position.set(position.x, position.y, position.z);
        camera.target = new THREE.Vector3(target.x, target.y, target.z);
        this.camera = camera;
        this.innerViewControls = new InnerViewControls(this.camera);
    }

    initScene = () => {
        const {
            scene_texture_resource: textureResource,
            axes_helper_display: isAxesHelperDisplay
        } = this.props;
        this.sceneContainer = document.getElementById('video')
        let geometry = new THREE.SphereGeometry(500, 80, 40); // 球体
        geometry.scale(-1, 1, 1);
        this.sceneTextureHelper = new TextureHelper(this.sceneContainer);
        let texture = this.sceneTextureHelper.loadTexture(textureResource);
        let material = new THREE.MeshBasicMaterial({ map: texture });
        this.sceneMesh = new THREE.Mesh(geometry, material);
        this.scene = new THREE.Scene();
        this.scene.add(this.sceneMesh);
        if (isAxesHelperDisplay) {
            let axisHelper = new THREE.AxesHelper(1000)//每个轴的长度
            this.scene.add(axisHelper);
        }
        this.scene.add(this.camera);
    }

    initRenderer = () => {
        const renderer = this.renderer;
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(this.mount.clientWidth, this.mount.clientHeight);
        renderer.sortObjects = false;
        renderer.autoClear = false;
        this.mount.appendChild(renderer.domElement);
    }

    initVR = () => {
        this.vrHelper = new VRHelper(this.renderer, this.camera, this.mount.clientWidth, this.mount.clientHeight);
    }

    animate = (time) => {
        requestAnimationFrame(this.animate);
        time *= 0.001;
        this.innerViewControls && this.innerViewControls.update();
        if (this.centerModelHelper) {
            this.centerModelHelper.update();
        }
        if (this.spriteParticleHelper) {
            this.spriteParticleHelper.update();
        }
        TWEEN.update(); // 不要轻易去掉，渐变动画依赖该库
        if (this.spriteShapeHelper && this.spriteShapeHelper.pointGroup && this.spriteShapeHelper.pointGroup.children) {
            var pickedObject = this.vrHelper.pick({ x: 0, y: 0 },
                this.scene, this.camera, time, Array.from(this.spriteShapeHelper.pointGroup.children));
            if (!!pickedObject) {
                const key = pickedObject.name;
                if (this.spriteEventList.has(key)) {
                    const data = this.spriteEventList.get(key);
                    this.handler('hot_spot_click', { data });
                }
            }
        }
        this.vrHelper.render(this.scene, this.camera);
    }

    /****************************全景场景相关控制接口************************* */
    setSenceResource = (res) => {
        this.sceneTextureHelper && this.sceneTextureHelper.unloadResource();
        this.sceneTextureHelper = new TextureHelper(this.sceneContainer);
        let texture = this.sceneTextureHelper.loadTexture(res);
        let material = new THREE.MeshBasicMaterial({ map: texture });
        this.sceneMesh.material = material;
    }

    // 背景全景视频播放控制
    startDisplaySenceResource = () => {
        if (this.sceneTextureHelper) {
            this.sceneTextureHelper.startDisplay();
        }
    }
    pauseDisplaySenceResource = () => {
        if (this.sceneTextureHelper) {
            this.sceneTextureHelper.pauseDisplay();
        }
    }

    // 自动旋转相关接口
    getEnableAutoRotate = () => {
        return this.innerViewControls.getEnableAutoRotate();
    }

    setEnableAutoRotate = (enable) => {
        this.innerViewControls.setEnableAutoRotate(enable)
    }

    setAutoRotateSpeed = (speed) => {
        this.innerViewControls.setAutoRotateSpeed(speed);
    }

    setAutoRotateDirection = (direction) => {
        this.innerViewControls.setAutoRotateDirection(direction);
    }

    /****************************热点标签相关控制接口************************* */
    resetHotSpotsData = () => {
        if (!this.spriteShapeHelper) {
            this.spriteEventList = new Map();
            this.spriteShapeHelper = new SpriteShapeHelper(this.scene,
                this.camera, this.renderer);
        } else {
            this.spriteEventList.clear();
        }
    }

    setHotSpots = (hot_spot_list, event_list) => {
        this.resetHotSpotsData();
        this.spriteEventList = new Map(event_list);
        this.spriteShapeHelper.setHotSpotList(hot_spot_list);
        this.spriteShapeHelper.objectClickHandler = (intersects) => {
            const key = intersects[0].object.name;
            if (this.spriteEventList.has(key)) {
                const data = this.spriteEventList.get(key);
                this.handler('hot_spot_click', { data })
            }
            console.log(intersects[0].object.name);
        }
    }

    addHotSpot = (hot_spot, event) => {
        this.spriteShapeHelper.addHotSpot(hot_spot);
        if (event != null && !this.spriteEventList.has(event.key)) {
            this.spriteEventList.set(event.key, event.value);
        }
    }

    removeHotSpot = (hot_spot_key) => {
        this.spriteShapeHelper.removeHotSpot(hot_spot_key);
    }

    /*****************************模型控制相关接口**************************** */

    resetModels = () => {
        if (!this.centerModelHelper) {
            this.centerModelHelper = new CenterModelHelper(this.scene);
        }
    }

    setModels = (model_list) => {
        this.resetModels();
        this.centerModelHelper.loadModelList(model_list);
    }

    addModel = (model_key, model) => {
        this.centerModelHelper.loadModel(model_key, model);
    }

    removeModel = (model_key) => {
        this.centerModelHelper.removeModel(model_key);
    }

    removeAllModel = () => {
        this.centerModelHelper.removeAllModel();
    }


    /**************************相机移动相关接口************************* */

    toNormalView = (durtime = 8000, delay = 0) => {
        if (!this.viewConvertHelper) {
            this.viewConvertHelper = new ViewConvertHelper(this.camera, this.innerViewControls);
        }
        this.innerViewControls.disConnect();
        this.viewConvertHelper.toNormalView(durtime, delay);
    }
    toPlanetView = (durtime = 8000, delay = 0) => {
        if (!this.viewConvertHelper) {
            this.viewConvertHelper = new ViewConvertHelper(this.camera, this.innerViewControls);
        }
        this.innerViewControls.disConnect();
        this.viewConvertHelper.toPlanetView(durtime, delay);
    }

    /**************************相机控制相关接口************************* */
    // 相机控制器开关
    connectCameraControl = () => {
        this.innerViewControls.connect();
    }
    disConnectCameraControl = () => {
        this.innerViewControls.disConnect();
    }

    // 方向传感器控制开关
    getEnableOrientationControls = () => {
        return this.innerViewControls.getEnableOrientationControls();
    }
    enableOrientationControls = () => {
        this.innerViewControls.enableOrientationControls();
    }
    disableOrientationControls = () => {
        this.innerViewControls.disableOrientationControls();
    }

    // 相机位置接口
    getCameraPosition = () => {
        return this.innerViewControls.getCameraPosition();
    }
    setCameraPosition = (x, y, z) => {
        this.innerViewControls.setCameraPosition(x, y, z);
    }

    // 相机当前fov接口
    setCameraFov = (fov) => {
        this.innerViewControls.setCameraFov(fov);
    }
    getCameraFov = () => {
        return this.innerViewControls.getCameraFov();
    }

    // FOV上下范围设置接口
    setFovVerticalScope = (bottom, top) => {
        this.innerViewControls.setFovVerticalScope(bottom, top);
    }
    getFovVerticalScope = () => {
        return this.innerViewControls.getFovVerticalScope();
    }

    /*******************************粒子特效接口********************************** */
    setParticleEffectRes = (res) => {
        if (!this.spriteParticleHelper) {
            this.spriteParticleHelper = new SpriteParticleHelper(this.scene);
        }
        this.spriteParticleHelper.setResource(res);
    }
    getEnableParticleDisplay = () => {
        return this.spriteParticleHelper.getEnableDisplay();
    }
    enableParticleDisplay = (enable) => {
        if (enable) {
            this.spriteParticleHelper.enableDisplay();
        } else {
            this.spriteParticleHelper.disableDisplay();
        }
    }

    /*******************************VR接口********************************** */
    changeVRStatus = () => {
        if (this.vrHelper.vrStatus) {
            this.vrHelper.disable();
            this.renderer.setViewport(0, 0, this.mount.clientWidth, this.mount.clientHeight);
        }
        else {
            this.vrHelper.enable();
        }
    }

    /*******************************其他接口********************************** */
    onWindowResize = (mountWidth, mountHeight) => {
        this.camera.aspect = mountWidth / mountHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(mountWidth, mountHeight);
    }

    destroy = () => {
        this.mount.removeChild(this.renderer.domElement)
    }
}

export default XRPlayerManager;