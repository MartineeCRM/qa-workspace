-- 세션 이름 find-or-create 레이스 방지: qa_rounds_env_number_uq와 같은 목적으로,
-- (qa_round_id, name) 조합에 유니크 인덱스를 걸어 동시성 상황에서 DB가 중복 생성을 막도록 한다.
-- 주 용도는 "이월 항목" 자동 생성 세션의 동시 중복 방지지만, 사용자가 직접 짓는 세션 이름에도
-- 동일하게 적용된다 (설계 의도상 세션 이름은 "장바구니 검증"처럼 구체적인 자유 텍스트 라벨이라
-- 같은 라운드 안에서 완전히 동일한 문자열이 중복되는 경우는 실제로는 드물 것으로 판단).
CREATE UNIQUE INDEX qa_sessions_round_name_uq ON public.qa_sessions (qa_round_id, name);
