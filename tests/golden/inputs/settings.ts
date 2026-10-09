// The `settings` sweep's inputs (CLEANUP-PLAN.md §2).

/** 30 saved-settings JSON strings for layout and mode. */
export const SETTINGS_CORPUS = [
  { name: 'empty', json: '{}' },
  { name: 'good_layout', json: '{"v":1,"app":"0.9.0","w":1000,"h":800,"layout":{},"mode":"graphing"}' },
  { name: 'good_vectors', json: '{"v":1,"app":"0.9.0","w":1000,"h":800,"layout":{},"mode":"vectors"}' },
  { name: 'good_sandbox', json: '{"v":1,"app":"0.9.0","w":1000,"h":800,"layout":{},"mode":"sandbox"}' },
  { name: 'old_mode', json: '{"mode":"author"}' },
  { name: 'damaged', json: '{"mode": 123}' },
  { name: 'null', json: 'null' },
  { name: 'array', json: '[]' },
  { name: 'bad_json', json: '{mode:"graphing"}' },
  { name: 'missing_layout', json: '{"v":1,"app":"0.9.0","w":1000,"h":800,"mode":"graphing"}' },
  { name: 'wrong_version', json: '{"v":999,"app":"0.9.0","w":1000,"h":800,"layout":{},"mode":"graphing"}' },
  { name: 'wrong_size', json: '{"v":1,"app":"0.9.0","w":100,"h":100,"layout":{},"mode":"graphing"}' },
  { name: 'missing_mode', json: '{"v":1,"app":"0.9.0","w":1000,"h":800,"layout":{}}' },
  { name: 'unknown_mode', json: '{"v":1,"app":"0.9.0","w":1000,"h":800,"layout":{},"mode":"unknown"}' },
  { name: 'just_mode', json: '{"mode":"calculator"}' },
  { name: 'extra_1', json: '{"mode":"practice"}' },
  { name: 'extra_2', json: '{"mode":"pure"}' },
  { name: 'extra_3', json: '{"mode":"lab"}' },
  { name: 'extra_4', json: '{"mode":"sandbox","layout":null}' },
  { name: 'extra_5', json: '{"mode":"Graphing"}' }
]

/** Saved label preferences. */
export const LABEL_PREFS_CORPUS = [
  { name: 'empty', json: '{}' },
  { name: 'v1_off', json: '{"measureLabels":"off"}' },
  { name: 'good', json: '{"measureLabels":"measure","labelShow":"hover"}' },
  { name: 'all_prefs', json: '{"angleUnit":"rad","showGrid":false,"gridStyle":"dots","showAxes":false,"snap":false,"decimals":4,"precisionMode":"sf","unit":"m","unitPerSquare":2,"labelShow":"always","measureLabels":"none","pointLetters":false,"showAngleMarks":false,"vectorNotation":"bold","componentForm":"column","directionStyle":"bearing"}' },
  { name: 'damaged', json: '{"measureLabels": 123}' },
  { name: 'null', json: 'null' },
  { name: 'array', json: '[]' },
  { name: 'bad_json', json: '{measureLabels:"off"}' },
  { name: 'unknown_keys', json: '{"unknown":true,"measureLabels":"off"}' },
  { name: 'partial', json: '{"vectorNotation":"bold"}' }
]
