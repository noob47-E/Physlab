import os
import json
import re
from xml.etree import ElementTree as ET

DATA_DIRS = ["/tmp/osbooks-college-algebra-bundle", "/tmp/osbooks-calculus-bundle"]
OUT_FILE = "tests/engine/scoreboard/external/extracted.json"

CLASSES_BY_TITLE = {
    "expand": ["polynomials", "multiply polynomials"], 
    "2x2 and 3x3 linear systems": ["systems of linear equations"],
    "rational-expression simplification": ["rational expressions", "simplify rational expressions"],
    "derivatives": ["differentiation rules", "derivatives of trigonometric functions", "derivatives of exponential", "the derivative", "derivatives of", "derivatives"],
    "partial fractions": ["partial fractions", "partial fraction decomposition"],
    "factor over ℚ": ["factoring polynomials"],
    "polynomial equations": ["solving quadratic equations", "polynomial equations", "quadratic equations", "zeros of polynomial functions", "solve a quadratic equation"]
}

def clean_text(mml_node):
    if mml_node is None: return None
    if mml_node.findall('.//m:mtext', ns) or mml_node.findall('.//m:merror', ns):
        return None
        
    text = ET.tostring(mml_node, encoding='unicode')
    
    def traverse(node):
        tag = node.tag.split('}')[-1]
        
        if tag == 'msup':
            if len(node) == 2:
                base = traverse(node[0])
                exp = traverse(node[1])
                return f"({base})^({exp})"
        elif tag == 'mfrac':
            if len(node) == 2:
                num = traverse(node[0])
                den = traverse(node[1])
                return f"(({num})/({den}))"
        elif tag == 'mfenced':
            open_delim = node.attrib.get('open', '(')
            close_delim = node.attrib.get('close', ')')
            content = "".join(traverse(c) for c in node)
            return f"{open_delim}{content}{close_delim}"
        elif tag == 'msqrt':
            content = "".join(traverse(c) for c in node)
            return f"sqrt({content})"
        elif tag == 'mroot':
            if len(node) == 2:
                base = traverse(node[0])
                index = traverse(node[1])
                return f"nthRoot({base},{index})"
        
        res = ""
        if node.text: res += node.text
        for child in node:
            res += traverse(child)
            if child.tail: res += child.tail
        return res

    res = traverse(mml_node).replace('\n', '').replace(' ', '').replace('\u2061', '').replace('\u202F', '').replace('−', '-').replace('\u00A0', '').replace('\u2003', '').strip()
    res = re.sub(r'\.$', '', res)
    return res

results = {k: [] for k in CLASSES_BY_TITLE.keys()}

ns = {'m': 'http://www.w3.org/1998/Math/MathML', 'cnxml': 'http://cnx.rice.edu/cnxml'}

for d in DATA_DIRS:
    if not os.path.exists(d): continue
    for root, dirs, files in os.walk(d):
        for f in files:
            if f.endswith('.cnxml'):
                p = os.path.join(root, f)
                try:
                    tree = ET.parse(p)
                    doc = tree.getroot()
                    title = doc.find('.//cnxml:title', ns)
                    title_text = title.text.lower().strip() if title is not None and title.text else ""
                    
                    matched_class = None
                    for c_name, kw_list in CLASSES_BY_TITLE.items():
                        if any(kw == title_text for kw in kw_list):
                            matched_class = c_name
                            break
                    if not matched_class:
                        for c_name, kw_list in CLASSES_BY_TITLE.items():
                            if any(title_text.startswith(kw) for kw in kw_list):
                                matched_class = c_name
                                break
                    if not matched_class: continue
                    
                    book_name = "Calculus Volume 1" if "calculus" in d else "College Algebra 2e"
                    
                    exercises = doc.findall('.//cnxml:exercise', ns)
                    for ex in exercises:
                        prob = ex.find('.//cnxml:problem', ns)
                        sol = ex.find('.//cnxml:solution', ns)
                        
                        if prob is not None and sol is not None:
                            prob_maths = prob.findall('.//m:math', ns)
                            sol_maths = sol.findall('.//m:math', ns)
                            
                            p_text = ""
                            s_text = ""
                            ex_class = matched_class
                            
                            if ex_class == "2x2 and 3x3 linear systems" and len(prob_maths) >= 1 and len(sol_maths) >= 1:
                                prob_text_full = "".join(prob.itertext()).lower()
                                sol_text_full = "".join(sol.itertext()).lower()
                                if "solve" in prob_text_full and ("(" in sol_text_full or "x=" in sol_text_full.replace(" ", "")):
                                    p_text = ", ".join(filter(None, [clean_text(m) for m in prob_maths]))
                                    s_text = clean_text(sol_maths[-1])
                            elif ex_class == "polynomial equations" and len(prob_maths) >= 1 and len(sol_maths) >= 1:
                                prob_text_full = "".join(prob.itertext()).lower()
                                if "solve" in prob_text_full:
                                    p_text = clean_text(prob_maths[0])
                                    s_text = ", ".join(filter(None, [clean_text(m) for m in sol_maths[-3:]])) 
                            elif ex_class in ["factor over ℚ"] and len(prob_maths) >= 1 and len(sol_maths) >= 1:
                                p_text = clean_text(prob_maths[0])
                                s_text = clean_text(sol_maths[-1])
                            elif len(prob_maths) == 1 and len(sol_maths) >= 1:
                                p_text = clean_text(prob_maths[0])
                                s_text = clean_text(sol_maths[-1])
                            else:
                                continue
                                
                            if p_text and s_text:
                                results[ex_class].append({
                                    "id": ex.attrib.get('id', 'unknown'),
                                    "class": ex_class,
                                    "question": p_text,
                                    "answer": s_text,
                                    "source": {
                                        "book": book_name,
                                        "edition": "2e" if "algebra" in book_name.lower() else "1",
                                        "chapter": "",
                                        "section": title.text if title is not None else "",
                                        "exercise number": ex.attrib.get('id', 'unknown'),
                                        "url": "https://openstax.org"
                                    }
                                })
                except Exception as e:
                    pass

with open(OUT_FILE, 'w') as f:
    json.dump(results, f, indent=2)
