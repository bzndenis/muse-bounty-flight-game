// Keyboard and mouse input: arrows fly the plane, W/S work the throttle,
// C swaps the camera, A toggles the co-pilot, P pauses, M mutes, R restarts.
export function newInput() {
  return {
    pitchUp: false,
    pitchDown: false,
    rollLeft: false,
    rollRight: false,
    throttleUp: false,
    throttleDown: false,
    mouseSteer: false,
    mouseRoll: 0,
    mousePitch: 0,
  };
}

export function bindInput(canvas, input, actions) {
  const keyMap = {
    ArrowUp: 'pitchUp',
    ArrowDown: 'pitchDown',
    ArrowLeft: 'rollLeft',
    ArrowRight: 'rollRight',
    KeyW: 'throttleUp',
    KeyS: 'throttleDown',
  };
  window.addEventListener('keydown', (e) => {
    if (keyMap[e.code] !== undefined) {
      input[keyMap[e.code]] = true;
      e.preventDefault();
    }
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') actions.confirm();
    if (e.code === 'KeyC') actions.toggleView();
    if (e.code === 'KeyA') actions.toggleAutopilot();
    if (e.code === 'KeyP') actions.togglePause();
    if (e.code === 'KeyM') actions.toggleMute();
    if (e.code === 'KeyR') actions.restart();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.throttleUp = true;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') input.throttleDown = true;
  });
  window.addEventListener('keyup', (e) => {
    if (keyMap[e.code] !== undefined) input[keyMap[e.code]] = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.throttleUp = false;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') input.throttleDown = false;
  });
  // Mouse: hold and drag to steer; click starts the game on the title screen.
  let dragging = false;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    updateMouse(e);
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    input.mouseSteer = false;
    input.mouseRoll = 0;
    input.mousePitch = 0;
  });
  window.addEventListener('mousemove', (e) => {
    if (dragging) updateMouse(e);
  });
  function updateMouse(e) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    input.mouseSteer = true;
    input.mouseRoll = nx;
    input.mousePitch = -ny;
  }
  canvas.addEventListener('click', () => actions.confirm());
}
