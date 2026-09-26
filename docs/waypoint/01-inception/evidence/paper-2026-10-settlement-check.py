# 종이 근무표 2026-10 (O=OFF), 이월off, 이월N, 종이의 누적off
rows = {
 '박서연': (-1,2,0, "E E O O N N O O D D D O O O D D E O N N O O E E E O N N O O D"),
 '정하늘': ( 4,3,4, "N N O O D D D O E N N O O D E O O O O E N N O O D D E E O E E"),
 '오민지': ( 1,2,2, "O O N N O O O D E E O N N O O E E E O D D D O D D E O O N N O"),
 '강도윤': ( 1,3,3, "E O N N O O O D D E O E E O O N N O O D D E O O N N O O E E O"),
 '윤채원': (-1,3,0, "O D D D E O E E O O O O N N N O O O D E E O D N N N O O D D O"),
 '임소라': ( 0,2,1, "D O E O E E N N N O O D D E O N N N O O E E O O O O O D D O D"),
 '배지현': ( 1,2,2, "O O D E O O O N N O E E E E O O D D E O O O N N O O D D E N N"),
 '서예린': ( 3,4,3, "N N O O D E E E O O D D D N N O O E E O O D D D O O N N O O E"),
 '홍다은': ( 2,2,2, "D O O D N N N O O D E O O D E E O N N N O O E E O D D E N O O"),
 '문가을': ( 3,5,0, "O E E E O D D O O N N N O O D D D D D O N N N O E E E O O D N"),
}
for base in (10, 11):
    print(f"--- 기준 OFF {base}")
    for n,(co,cn,paper,s) in rows.items():
        c = s.split(); assert len(c)==31, (n,len(c))
        off, nn = c.count('O'), c.count('N')
        so = (cn+nn)//6
        a = co + (off - so - base)   # 종이 규약 후보: +면 더 쉼
        b = co + (base - (off - so)) # README 규약 후보
        print(f"{n} off={off} N={nn} SO={so} 후보A={a:+} 후보B={b:+} 종이={paper:+}  {'A일치' if a==paper else ''}{'B일치' if b==paper else ''}")
