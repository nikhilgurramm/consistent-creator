(() => {
  // ── Elements ──
  const webcamVideo     = document.getElementById('webcamVideo');
  const playbackVideo   = document.getElementById('playbackVideo');
  const playbackOverlay = document.getElementById('playbackOverlay');
  const previewFrame    = document.getElementById('previewFrame');
  const playbackFrame   = document.getElementById('playbackFrame');
  const badgeRatio      = document.getElementById('badgeRatio');
  const recordBtn       = document.getElementById('recordBtn');
  const pauseBtn        = document.getElementById('pauseBtn');
  const pauseIconSvg    = document.getElementById('pauseIconSvg');
  const flipBtn         = document.getElementById('flipBtn');
  const downloadBtn     = document.getElementById('downloadBtn');
  const deleteBtn       = document.getElementById('deleteBtn');
  const postActions     = document.getElementById('postActions');
  const recControls     = document.querySelector('.rec-controls');
  const timerEl         = document.getElementById('timer');
  const statusEl        = document.getElementById('status');
  const recIndicator    = document.getElementById('recIndicator');
  const pauseIndicator  = document.getElementById('pauseIndicator');
  const toastEl         = document.getElementById('toast');
  const cameraSelect    = document.getElementById('cameraSelect');
  const micSelect       = document.getElementById('micSelect');
  const ratioGrid       = document.getElementById('ratioGrid');
  const folderPath      = document.getElementById('folderPath');
  const browseFolderBtn = document.getElementById('browseFolderBtn');
  const renameModal     = document.getElementById('renameModal');
  const renameInput     = document.getElementById('renameInput');
  const renameSaveBtn   = document.getElementById('renameSaveBtn');
  const renameCancelBtn = document.getElementById('renameCancelBtn');

  // ── State ──
  let mediaStream    = null;
  let mediaRecorder  = null;
  let recordedChunks = [];
  let recordedBlob   = null;
  let isRecording    = false;
  let isPaused       = false;
  let timerInterval  = null;
  let seconds        = 0;
  let selectedCameraId = '';
  let selectedMicId    = '';
  let currentRatio     = { w: 9, h: 16, label: '9:16' };
  let selectedFps      = 30;    // used for canvas captureStream only

  // ── Canvas recording (bakes effects into video) ──
  const recordCanvas = document.createElement('canvas');
  const recordCtx = recordCanvas.getContext('2d');
  let canvasAnimFrame = null;

  // ── Environment detection ──
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  let ffmpegInstance = null;

  // ── Supabase config ──
  const SUPABASE_URL = 'https://yqzxsmrhcagyvopbnmzd.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_Cu7n5WqTG1HL-aWWa4zV_w_xsxD-8gE';
  const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

  // ── Email Gate ──
  const emailGate = document.getElementById('emailGate');
  const gateForm  = document.getElementById('gateForm');
  const gateEmail = document.getElementById('gateEmail');
  const gateSubmit = document.getElementById('gateSubmit');

  function checkEmailGate() {
    if (isLocal) {
      // Skip gate on local dev
      emailGate.classList.add('hidden');
      return;
    }
    const savedEmail = localStorage.getItem('cc_email');
    if (savedEmail) {
      emailGate.classList.add('hidden');
    }
  }

  if (gateForm) {
    gateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = gateEmail.value.trim();
      // Double-check email format in JS
      const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
      if (!email || !emailRegex.test(email)) {
        gateEmail.setCustomValidity('Please enter a valid email address');
        gateEmail.reportValidity();
        return;
      }
      gateEmail.setCustomValidity('');

      gateSubmit.disabled = true;
      gateSubmit.textContent = 'Starting...';

      // Save to Supabase via REST API
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${SUPABASE_ANON}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ email })
        });
        if (res.ok) {
          console.log('✅ Email saved to waitlist');
        } else {
          const err = await res.text();
          // 409 = duplicate, that's fine
          if (res.status === 409 || err.includes('duplicate')) {
            console.log('ℹ️ Email already exists');
          } else {
            console.warn('Supabase insert failed:', res.status, err);
          }
        }
      } catch (err) {
        console.warn('Supabase request failed:', err);
      }

      localStorage.setItem('cc_email', email);
      emailGate.classList.add('hidden');
    });
  }

  checkEmailGate();

  // ── Hide folder picker when deployed ──
  const folderSection = document.getElementById('folderSection');
  if (!isLocal && folderSection) {
    folderSection.style.display = 'none';
  }

  // ── Init ──
  if (isLocal) loadDefaultPath();
  initDevices();
  initRatioButtons();

  // ── Load default save path ──
  async function loadDefaultPath() {
    try {
      const res = await fetch('/default-path');
      const data = await res.json();
      folderPath.value = data.path;
    } catch {}
  }

  // ── Browse folder (native macOS picker) ──
  browseFolderBtn.addEventListener('click', async () => {
    browseFolderBtn.disabled = true;
    try {
      const res = await fetch('/pick-folder');
      const data = await res.json();
      if (data.path && !data.cancelled) {
        folderPath.value = data.path;
        showToast(`Folder set: ${data.path}`);
      }
    } catch (err) {
      showToast('Could not open folder picker');
    }
    browseFolderBtn.disabled = false;
  });

  // ── Enumerate Devices ──
  async function initDevices() {
    setStatus('Initializing camera...');
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tempStream.getTracks().forEach(t => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();

      // Cameras
      const cameras = devices.filter(d => d.kind === 'videoinput');
      cameraSelect.innerHTML = '';
      cameras.forEach((cam, i) => {
        const opt = document.createElement('option');
        opt.value = cam.deviceId;
        opt.textContent = cam.label || `Camera ${i + 1}`;
        cameraSelect.appendChild(opt);
      });

      // Microphones
      const mics = devices.filter(d => d.kind === 'audioinput');
      micSelect.innerHTML = '';
      mics.forEach((mic, i) => {
        const opt = document.createElement('option');
        opt.value = mic.deviceId;
        opt.textContent = mic.label || `Microphone ${i + 1}`;
        micSelect.appendChild(opt);
      });

      selectedCameraId = cameras[0]?.deviceId || '';
      selectedMicId = mics[0]?.deviceId || '';

      await startCamera();
    } catch (err) {
      console.error(err);
      setStatus('Camera access denied', 'error');
    }
  }

  // ── Device change ──
  cameraSelect.addEventListener('change', () => {
    if (isRecording) return;
    selectedCameraId = cameraSelect.value;
    startCamera();
  });

  micSelect.addEventListener('change', () => {
    if (isRecording) return;
    selectedMicId = micSelect.value;
    startCamera();
  });
  // ── Camera ──
  // Mac cameras only support 16:9 and 9:16 natively.
  // For 3:4 and 1:1, we keep the camera in its current mode
  // and let CSS object-fit:cover handle the visual crop.
  function getCameraMode() {
    // Portrait ratios → use 9:16 camera mode
    if (currentRatio.h > currentRatio.w) return 'portrait';
    // Everything else → use 16:9 camera mode
    return 'landscape';
  }

  // Apply aspect ratio change to existing live track
  async function applyCameraRatio() {
    if (!mediaStream) return startCamera();
    const vTrack = mediaStream.getVideoTracks()[0];
    if (!vTrack) return startCamera();

    const cameraLoader = document.getElementById('cameraLoader');
    const mode = getCameraMode();
    const s = vTrack.getSettings();
    const currentlyPortrait = s.height > s.width;
    const needsPortrait = mode === 'portrait';

    // Show loader during every ratio switch
    if (cameraLoader) cameraLoader.classList.remove('hidden');

    // Only change camera if we need to switch between landscape/portrait
    if (needsPortrait !== currentlyPortrait) {
      try {
        // Reset to 16:9 first
        await vTrack.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 } });
        await new Promise(r => setTimeout(r, 300));

        if (needsPortrait) {
          // Switch to portrait
          await vTrack.applyConstraints({
            width: { ideal: 1080 }, height: { ideal: 1920 },
            aspectRatio: { ideal: 9 / 16 }
          });
        }

        const s2 = vTrack.getSettings();
        console.log(`📹 Camera → ${mode}: ${s2.width}x${s2.height}`);
      } catch (err) {
        console.warn('applyConstraints failed, doing full restart:', err);
        await startCamera();
      }
    } else {
      // Same camera mode, just CSS changes — brief delay for visual smoothness
      await new Promise(r => setTimeout(r, 200));
      console.log(`📹 Camera stays ${mode}, CSS handles ${currentRatio.label} crop`);
    }

    setStatus('Ready to record');
    if (cameraLoader) cameraLoader.classList.add('hidden');
  }

  // Full camera start — only for initial setup or device changes
  async function startCamera() {
    const cameraLoader = document.getElementById('cameraLoader');
    try {
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        webcamVideo.srcObject = null;
        mediaStream = null;
      }

      const needsPortrait = getCameraMode() === 'portrait';

      // Show loader while camera settles
      if (needsPortrait && cameraLoader) {
        cameraLoader.classList.remove('hidden');
      }

      // Always start in native 16:9 to prevent Mac camera crop
      const constraints = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      };

      if (selectedCameraId) {
        constraints.video.deviceId = { exact: selectedCameraId };
      }
      if (selectedMicId) {
        constraints.audio = { deviceId: { exact: selectedMicId } };
      }

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      webcamVideo.srcObject = mediaStream;

      const vTrack = mediaStream.getVideoTracks()[0];
      if (vTrack) {
        const s = vTrack.getSettings();
        console.log(`📹 Camera (16:9 init): ${s.width}x${s.height} @ ${s.frameRate}fps`);

        // After camera settles, switch to portrait if needed
        if (needsPortrait) {
          setTimeout(async () => {
            try {
              await vTrack.applyConstraints({
                width: { ideal: 1080 }, height: { ideal: 1920 },
                aspectRatio: { ideal: 9 / 16 }
              });
              const s2 = vTrack.getSettings();
              console.log(`📹 Camera (portrait applied): ${s2.width}x${s2.height}`);
            } catch (e) {
              console.warn('Portrait apply failed:', e);
            }
            if (cameraLoader) cameraLoader.classList.add('hidden');
          }, 1500);
        } else {
          if (cameraLoader) cameraLoader.classList.add('hidden');
        }
      }

      setStatus('Ready to record');
    } catch (err) {
      console.error(err);
      setStatus('Camera error', 'error');
      if (cameraLoader) cameraLoader.classList.add('hidden');
    }
  }

  // ── Aspect Ratio ──
  function initRatioButtons() {
    const btns = ratioGrid.querySelectorAll('.ratio-btn');
    // Default to 9:16
    btns.forEach(b => {
      if (b.dataset.ratio === '9:16') b.classList.add('active');
    });

    ratioGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.ratio-btn');
      if (!btn || isRecording) return;

      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentRatio = {
        w: parseInt(btn.dataset.w),
        h: parseInt(btn.dataset.h),
        label: btn.dataset.ratio
      };

      applyRatio();
      badgeRatio.textContent = currentRatio.label;
      applyCameraRatio();
    });

    applyRatio();
  }

  function applyRatio() {
    const ratio = `${currentRatio.w} / ${currentRatio.h}`;
    previewFrame.style.aspectRatio = ratio;
    playbackFrame.style.aspectRatio = ratio;
    sizePreviews();
  }

  // Size preview to fit within center area
  function sizePreviews() {
    const centerEl = document.querySelector('.center');
    const maxW = centerEl.clientWidth - 48;
    const maxH = centerEl.clientHeight - 48;

    const ratioVal = currentRatio.w / currentRatio.h;
    let w, h;
    if (maxW / maxH > ratioVal) {
      h = maxH;
      w = h * ratioVal;
    } else {
      w = maxW;
      h = w / ratioVal;
    }

    previewFrame.style.width = `${Math.round(w)}px`;
    previewFrame.style.height = `${Math.round(h)}px`;
    playbackFrame.style.width = `${Math.round(w)}px`;
    playbackFrame.style.height = `${Math.round(h)}px`;
  }

  window.addEventListener('resize', sizePreviews);

  // ── Flip Camera ──
  flipBtn.addEventListener('click', () => {
    if (isRecording) return;
    const options = Array.from(cameraSelect.options);
    if (options.length < 2) { showToast('Only one camera'); return; }
    const idx = options.findIndex(o => o.value === selectedCameraId);
    const next = (idx + 1) % options.length;
    cameraSelect.value = options[next].value;
    selectedCameraId = options[next].value;
    startCamera();
    showToast('Camera switched');
  });

  // ── Record ──
  recordBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  function startRecording() {
    playbackOverlay.classList.remove('visible');
    postActions.classList.add('hidden');
    recControls.style.display = '';
    recordedChunks = [];
    recordedBlob = null;
    isPaused = false;

    // Set canvas size to match the camera's actual resolution
    const vTrack = mediaStream.getVideoTracks()[0];
    const settings = vTrack.getSettings();
    recordCanvas.width = settings.width || 1280;
    recordCanvas.height = settings.height || 720;

    // Build filter string for canvas (mirrors CSS filter logic)
    function getCanvasFilter() {
      const brightness = brightnessSlider.value / 100;
      const contrast = contrastSlider.value / 100;
      let parts = [`brightness(${brightness})`, `contrast(${contrast})`];

      switch (currentFilter) {
        case 'dim':   parts.push('brightness(0.75)'); break;
        case 'warm':  parts.push('sepia(0.25)', 'saturate(1.2)'); break;
        case 'cool':  parts.push('hue-rotate(15deg)', 'saturate(0.9)'); break;
        case 'bw':    parts.push('grayscale(1)'); break;
      }
      return parts.join(' ');
    }

    // Draw video to canvas each frame with effects
    function drawFrame() {
      if (!isRecording) return;
      recordCtx.filter = getCanvasFilter();

      const zoom = zoomSlider.value / 100;
      if (zoom > 1) {
        const sw = recordCanvas.width / zoom;
        const sh = recordCanvas.height / zoom;
        const sx = (recordCanvas.width - sw) / 2;
        const sy = (recordCanvas.height - sh) / 2;
        recordCtx.drawImage(webcamVideo, sx, sy, sw, sh, 0, 0, recordCanvas.width, recordCanvas.height);
      } else {
        recordCtx.drawImage(webcamVideo, 0, 0, recordCanvas.width, recordCanvas.height);
      }
      canvasAnimFrame = requestAnimationFrame(drawFrame);
    }
    isRecording = true;
    drawFrame();

    // Create stream from canvas + original audio
    const canvasStream = recordCanvas.captureStream(selectedFps);
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length > 0) {
      canvasStream.addTrack(audioTracks[0]);
    }

    // Prefer MP4 recording (Chrome 120+), fallback to WebM
    let mimeType;
    if (!isLocal && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')) {
      mimeType = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      mimeType = 'video/webm;codecs=vp9,opus';
    } else {
      mimeType = 'video/webm';
    }
    console.log('🎬 Recording format:', mimeType);

    mediaRecorder = new MediaRecorder(canvasStream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      cancelAnimationFrame(canvasAnimFrame);
      recordedBlob = new Blob(recordedChunks, { type: mimeType });
      const url = URL.createObjectURL(recordedBlob);
      playbackVideo.src = url;
      playbackOverlay.classList.add('visible');

      // Show post actions, hide rec controls
      recControls.style.display = 'none';
      postActions.classList.remove('hidden');

      setStatus('Click Download to save, or Delete to discard');
    };

    mediaRecorder.start(1000);

    recordBtn.classList.add('recording');
    recIndicator.classList.add('active');
    pauseIndicator.classList.remove('active');
    timerEl.classList.add('active');
    timerEl.classList.remove('paused');
    pauseBtn.disabled = false;
    pauseBtn.classList.remove('active-pause');
    flipBtn.disabled = true;
    updatePauseIcon(false);
    setStatus('Recording...');
    startTimer();
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    isPaused = false;

    recordBtn.classList.remove('recording');
    recIndicator.classList.remove('active');
    pauseIndicator.classList.remove('active');
    timerEl.classList.remove('active');
    timerEl.classList.remove('paused');
    pauseBtn.disabled = true;
    pauseBtn.classList.remove('active-pause');
    flipBtn.disabled = false;
    stopTimer();
  }

  // ── Pause / Resume ──
  pauseBtn.addEventListener('click', () => {
    if (!isRecording || !mediaRecorder) return;

    if (isPaused) {
      mediaRecorder.resume();
      isPaused = false;
      recIndicator.classList.add('active');
      pauseIndicator.classList.remove('active');
      timerEl.classList.add('active');
      timerEl.classList.remove('paused');
      pauseBtn.classList.remove('active-pause');
      updatePauseIcon(false);
      setStatus('Recording...');
      resumeTimer();
    } else {
      mediaRecorder.pause();
      isPaused = true;
      recIndicator.classList.remove('active');
      pauseIndicator.classList.add('active');
      timerEl.classList.remove('active');
      timerEl.classList.add('paused');
      pauseBtn.classList.add('active-pause');
      updatePauseIcon(true);
      setStatus('Paused');
      pauseTimer();
    }
  });

  function updatePauseIcon(showResume) {
    if (showResume) {
      pauseIconSvg.innerHTML = '<polygon points="6,4 20,12 6,20" fill="currentColor"/>';
    } else {
      pauseIconSvg.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>';
    }
  }

  // ── Download → Open rename modal ──
  downloadBtn.addEventListener('click', () => {
    if (!recordedBlob) return;
    // Generate a default filename from timestamp
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const defaultName = `recording_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    renameInput.value = defaultName;
    renameModal.classList.add('visible');
    setTimeout(() => {
      renameInput.focus();
      renameInput.select();
    }, 100);
  });

  // ── Modal Cancel ──
  renameCancelBtn.addEventListener('click', () => {
    renameModal.classList.remove('visible');
  });

  // Close modal on overlay click
  renameModal.addEventListener('click', (e) => {
    if (e.target === renameModal) renameModal.classList.remove('visible');
  });

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && renameModal.classList.contains('visible')) {
      renameModal.classList.remove('visible');
    }
  });

  // Enter key in rename input triggers save
  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') renameSaveBtn.click();
  });

  // ── Modal Save (actual upload) ──
  renameSaveBtn.addEventListener('click', async () => {
    if (!recordedBlob) return;
    let fileName = renameInput.value.trim();
    if (!fileName) {
      renameInput.focus();
      return;
    }
    // Sanitize: remove any .mp4/.webm extension the user might have typed
    fileName = fileName.replace(/\.(mp4|webm|mov|avi)$/i, '');

    renameModal.classList.remove('visible');

    if (isLocal) {
      // ── Local: upload to server FFmpeg ──
      setStatus('Converting to MP4...');
      const formData = new FormData();
      formData.append('video', recordedBlob, 'recording.webm');
      formData.append('outputDir', folderPath.value.trim());
      formData.append('fileName', fileName);

      try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
          const sizeMB = (data.size / 1024 / 1024).toFixed(1);
          showToast(`✓ Saved ${data.filename} (${sizeMB} MB)`);
          resetToRecordMode();
        } else {
          setStatus(data.error || 'Save failed', 'error');
        }
      } catch (err) {
        console.error(err);
        setStatus('Save error', 'error');
      }
    } else {
      // ── Deployed: direct browser download ──
      // If recorded as MP4 (Chrome 120+), download directly. Otherwise WebM.
      const isMP4 = recordedBlob.type.includes('mp4');
      const ext = isMP4 ? 'mp4' : 'webm';

      setStatus('Preparing download...');
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const sizeMB = (recordedBlob.size / 1024 / 1024).toFixed(1);
      showToast(`✓ Downloaded ${fileName}.${ext} (${sizeMB} MB)`);
      resetToRecordMode();
    }
  });

  // ── Delete ──
  deleteBtn.addEventListener('click', () => {
    recordedBlob = null;
    recordedChunks = [];
    showToast('Recording deleted');
    resetToRecordMode();
  });

  function resetToRecordMode() {
    playbackOverlay.classList.remove('visible');
    postActions.classList.add('hidden');
    recControls.style.display = '';

    playbackVideo.pause();
    playbackVideo.removeAttribute('src');
    playbackVideo.load();

    recordedBlob = null;
    recordedChunks = [];
    seconds = 0;
    timerEl.textContent = '00:00';
    pauseBtn.disabled = true;
    downloadBtn.style.pointerEvents = '';
    setStatus('Ready to record');
  }

  // ── Timer ──
  function startTimer() {
    seconds = 0;
    timerEl.textContent = '00:00';
    timerInterval = setInterval(() => {
      seconds++;
      timerEl.textContent = formatTime(seconds);
    }, 1000);
  }

  function stopTimer()   { clearInterval(timerInterval); }
  function pauseTimer()  { clearInterval(timerInterval); }
  function resumeTimer() {
    timerInterval = setInterval(() => {
      seconds++;
      timerEl.textContent = formatTime(seconds);
    }, 1000);
  }

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  // ── Status ──
  function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = 'status-text' + (type ? ` ${type}` : '');
  }

  // ── Toast ──
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  // ════════════════════════════════════════════════
  // ── RESOLUTION & FPS SELECTORS ──
  // ════════════════════════════════════════════════

  function initResolutionButtons() {
    const container = document.getElementById('resolutionOptions');
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.inline-btn');
      if (!btn || isRecording) return;
      container.querySelectorAll('.inline-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRes = parseInt(btn.dataset.res);
      // Resolution only affects output, no need to restart camera
    });
  }

  function initFpsButtons() {
    const container = document.getElementById('fpsOptions');
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.inline-btn');
      if (!btn || isRecording) return;
      container.querySelectorAll('.inline-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFps = parseInt(btn.dataset.fps);
      // Apply new frame rate to live camera track
      if (mediaStream) {
        const vTrack = mediaStream.getVideoTracks()[0];
        if (vTrack) {
          vTrack.applyConstraints(buildVideoConstraints()).then(() => {
            const s = vTrack.getSettings();
            console.log(`📹 FPS changed: ${s.width}x${s.height} @ ${s.frameRate}fps`);
          }).catch(err => console.warn('FPS applyConstraints failed:', err));
        }
      }
    });
  }

  // ════════════════════════════════════════════════
  // ── VIDEO EFFECTS (Right Sidebar) ──
  // ════════════════════════════════════════════════

  const brightnessSlider = document.getElementById('brightnessSlider');
  const contrastSlider   = document.getElementById('contrastSlider');
  const zoomSlider       = document.getElementById('zoomSlider');
  const brightnessVal    = document.getElementById('brightnessVal');
  const contrastVal      = document.getElementById('contrastVal');
  const zoomVal          = document.getElementById('zoomVal');
  const bgOptions        = document.getElementById('bgOptions');
  const resetFxBtn       = document.getElementById('resetFxBtn');

  let currentFilter = 'none';

  function applyEffects() {
    const brightness = brightnessSlider.value;
    const contrast   = contrastSlider.value;

    // Build CSS filter string
    let filters = [];
    filters.push(`brightness(${brightness}%)`);
    filters.push(`contrast(${contrast}%)`);

    // Filter presets
    switch (currentFilter) {
      case 'dim':
        filters.push('brightness(75%)');
        break;
      case 'warm':
        filters.push('sepia(25%)');
        filters.push('saturate(120%)');
        break;
      case 'cool':
        filters.push('hue-rotate(15deg)');
        filters.push('saturate(90%)');
        break;
      case 'bw':
        filters.push('grayscale(100%)');
        break;
    }

    const filterStr = filters.join(' ');
    const zoom = zoomSlider.value / 100;

    webcamVideo.style.filter = filterStr;
    webcamVideo.style.transform = zoom > 1 ? `scale(${zoom})` : '';
    playbackVideo.style.filter = filterStr;
    playbackVideo.style.transform = zoom > 1 ? `scale(${zoom})` : '';

    // Update labels
    brightnessVal.textContent = `${brightness}%`;
    contrastVal.textContent = `${contrast}%`;
    zoomVal.textContent = `${zoom.toFixed(1)}x`;
  }

  // Slider listeners
  brightnessSlider.addEventListener('input', applyEffects);
  contrastSlider.addEventListener('input', applyEffects);
  zoomSlider.addEventListener('input', applyEffects);

  // Filter options
  bgOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.bg-btn');
    if (!btn) return;

    bgOptions.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.bg;
    applyEffects();
  });

  // Reset all effects
  resetFxBtn.addEventListener('click', () => {
    brightnessSlider.value = 100;
    contrastSlider.value = 100;
    zoomSlider.value = 100;
    currentFilter = 'none';

    bgOptions.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
    bgOptions.querySelector('[data-bg="none"]').classList.add('active');

    applyEffects();
    showToast('Effects reset');
  });
})();
