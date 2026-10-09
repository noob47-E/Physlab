// The `files` sweep's inputs (CLEANUP-PLAN.md §2).

/** A corpus of .phys texts of formats 1 to 7 plus damaged ones. */
export const FILES_CORPUS = [
  { name: 'v1_basic', text: '{"app":"PhysLab","version":1,"objects":[{"id":"1","type":"point","name":"A","def":{"kind":"free","p":[0,0,0]}}]}' },
  { name: 'v2_space', text: '{"app":"PhysLab","version":2,"objects":[{"id":"1","type":"point","name":"A","space":"graphing","def":{"kind":"free","p":[0,0,0]}}]}' },
  { name: 'v3_lego', text: '{"app":"PhysLab","version":3,"objects":[{"id":"1","type":"polygon","name":"poly1","points":["2","3","4"],"lego":{"sourceId":"src","pieceIndex":0,"originalColor":"#ff0000","sourceSignature":"sig"}}]}' },
  { name: 'v4_themed', text: '{"app":"PhysLab","version":4,"objects":[{"id":"1","type":"vector","name":"v","color":"#ff0000","themed":"--vec-1"}]}' },
  { name: 'v5_questions', text: '{"app":"PhysLab","version":5,"objects":[],"questions":[{"id":"q1","title":"Q1"}]}' },
  { name: 'v6_questions_v2', text: '{"app":"PhysLab","version":6,"objects":[],"questions":[{"id":"q1","title":"Q1","parts":[]}]}' },
  { name: 'v7_lab_reads', text: '{"app":"PhysLab","version":7,"objects":[],"lab":[{"id":"t1","title":"T1","columns":[],"rows":[],"plot":{}}]}' },
  { name: 'damaged_no_app', text: '{"version":1,"objects":[]}' },
  { name: 'damaged_no_version', text: '{"app":"PhysLab","objects":[]}' },
  { name: 'damaged_bad_json', text: '{"app":"PhysLab",version:1}' },
  { name: 'damaged_no_objects', text: '{"app":"PhysLab","version":1}' },
  { name: 'damaged_bad_object', text: '{"app":"PhysLab","version":1,"objects":[{"id":"1"}]}' },
  { name: 'damaged_duplicate_id', text: '{"app":"PhysLab","version":1,"objects":[{"id":"1","type":"point","name":"A"},{"id":"1","type":"point","name":"B"}]}' },
  { name: 'damaged_future_version', text: '{"app":"PhysLab","version":999,"objects":[]}' },
  // Arrows in the eight colours 0.6.1–0.7 handed out, in a format-3 file (v3ToV4 gives each its theme token).
  { name: 'v3_old_arrow_colours', text: JSON.stringify({ app: 'PhysLab', version: 3, objects: ['#4dabf7', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#22b8cf', '#f06595'].map((color, i) => ({ id: `v${i}`, type: 'vector', name: `V${i}`, color, def: { kind: 'free', v: [i + 1, 1, 0] } })) }) },
  { name: 'v3_seventh_eighth_only', text: JSON.stringify({ app: 'PhysLab', version: 3, objects: [{ id: 'a', type: 'vector', name: 'A', color: '#4DABF7 ', def: { kind: 'free', v: [1, 0, 0] } }, { id: 'g', type: 'vector', name: 'G', color: '#22b8cf', def: { kind: 'free', v: [0, 1, 0] } }, { id: 'h', type: 'vector', name: 'H', color: '#f06595', def: { kind: 'free', v: [1, 1, 0] } }, { id: 'p', type: 'vector', name: 'P', color: '#123456', def: { kind: 'free', v: [2, 1, 0] } }] }) },
  // Lab tables and the sandbox, good and damaged (checkLab, checkSandbox).
  { name: 'v6_lab_good', text: JSON.stringify({ app: 'PhysLab', version: 6, objects: [], lab: [{ id: 't1', title: 'Pendulum', columns: [{ id: 'c1', name: 'L' }, { id: 'c2', name: 'T' }], rows: [[0.2, 0.9], [0.4, 1.27]], plot: { x: 'c1', y: 'c2' } }] }) },
  { name: 'v7_lab_label_reads', text: JSON.stringify({ app: 'PhysLab', version: 7, objects: [], lab: [{ id: 't1', title: 'T', columns: [{ id: 'c1', name: 'L', label: 'length (m)' }], rows: [[0.2]], reads: [['0.200']], plot: {} }] }) },
  { name: 'damaged_lab_not_list', text: '{"app":"PhysLab","version":7,"objects":[],"lab":{"id":"t1"}}' },
  { name: 'damaged_lab_no_columns', text: '{"app":"PhysLab","version":7,"objects":[],"lab":[{"id":"t1","title":"T","rows":[],"plot":{}}]}' },
  { name: 'damaged_lab_bad_label', text: '{"app":"PhysLab","version":7,"objects":[],"lab":[{"id":"t1","title":"T","columns":[{"id":"c1","name":"L","label":5}],"rows":[],"plot":{}}]}' },
  { name: 'sandbox_good', text: JSON.stringify({ app: 'PhysLab', version: 7, objects: [], sandbox: { bodies: [{ id: 'b1', shape: 'box', size: [1, 1, 1], position: [0, 2, 0] }, { id: 'b2', shape: 'sphere', size: [0.5, 0.5, 0.5], position: [2, 2, 0] }], links: [{ id: 'l1', kind: 'spring', a: 'b1', b: 'b2' }], world: { gravity: 9.81 }, sideView: true } }) },
  { name: 'sandbox_no_world', text: '{"app":"PhysLab","version":5,"objects":[],"sandbox":{"bodies":[]}}' },
  { name: 'damaged_sandbox_no_bodies', text: '{"app":"PhysLab","version":7,"objects":[],"sandbox":{}}' },
  { name: 'damaged_sandbox_body_position', text: '{"app":"PhysLab","version":7,"objects":[],"sandbox":{"bodies":[{"id":"b1","shape":"box","size":[1,1,1],"position":[0,2]}]}}' },
  { name: 'damaged_sandbox_link', text: '{"app":"PhysLab","version":7,"objects":[],"sandbox":{"bodies":[],"links":[{"id":"l1","kind":"spring","a":"b1"}]}}' },
  { name: 'damaged_sandbox_links_not_list', text: '{"app":"PhysLab","version":7,"objects":[],"sandbox":{"bodies":[],"links":{}}}' },
  { name: 'damaged_sandbox_world', text: '{"app":"PhysLab","version":7,"objects":[],"sandbox":{"bodies":[],"world":5}}' },
  { name: 'damaged_sandbox_side_view', text: '{"app":"PhysLab","version":7,"objects":[],"sandbox":{"bodies":[],"sideView":"yes"}}' },
  // Settings, the label words of the first builds, and Lego records.
  { name: 'damaged_settings', text: '{"app":"PhysLab","version":2,"objects":[],"settings":[1]}' },
  { name: 'v1_measure_labels_off', text: '{"app":"PhysLab","version":1,"objects":[],"settings":{"measureLabels":"off","decimals":3}}' },
  { name: 'v3_lego_damaged_record', text: '{"app":"PhysLab","version":3,"objects":[{"id":"1","type":"polygon","name":"poly1","points":["2","3","4"],"lego":{"sourceId":5}}]}' },
  { name: 'v3_lego_no_signature', text: '{"app":"PhysLab","version":3,"objects":[{"id":"1","type":"polygon","name":"poly1","points":["2","3","4"],"lego":{"sourceId":"s","pieceIndex":1,"originalColor":"#fff"}}]}' },
  { name: 'damaged_null_object', text: '{"app":"PhysLab","version":2,"objects":[null]}' },
  { name: 'damaged_not_object', text: '[1, 2]' },
  { name: 'damaged_version_zero', text: '{"app":"PhysLab","version":0,"objects":[]}' },
  { name: 'damaged_version_text', text: '{"app":"PhysLab","version":"7","objects":[]}' }
]

/** Scenes saved and turned back into format-1 files (the files sweep's v1Files). */
export const V1_SCENES: { name: string; space: 'vectors' | 'shapes' | 'graphing'; lines: string[] }[] = [
  { name: 'vectors and a resultant', space: 'vectors', lines: ['A = <3, 4>', 'B = <1, -2>', 'R = A + B', 'F = 10 N ∠ 30°'] },
  { name: 'points used by a segment and a polygon', space: 'shapes', lines: ['A = (0, 0)', 'B = (4, 0)', 'C = (4, 3)', 'Segment(A, B)', 'Polygon(A, B, C)', 'M = Midpoint(A, B)'] },
  { name: 'a slider used by a graph', space: 'graphing', lines: ['a = 2', 'y = a x^2', 'k = 5'] },
  { name: 'a lone point and a lone number', space: 'shapes', lines: ['P = (1, 2)', 'n = 3'] },
  { name: 'a circle on a centre and a line', space: 'shapes', lines: ['C = (1, 1)', 'Circle(C, 2)', 'Q = (3, 4)', 'Line(C, Q)'] }
]
