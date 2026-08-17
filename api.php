<?php
/* ---------------------------------------------------------------------------
   api.php — cầu ghi file cho trang liên kết Smartlog

   Chỉ dùng khi đặt trang trên hosting có PHP. Upload file này NẰM CẠNH
   index.html, rồi đổi khối STORE trong admin.html sang bản PHP (xem store-mau.txt).

   Việc duy nhất nó làm: kiểm mật khẩu rồi ghi đè index.html một cách an toàn.
   --------------------------------------------------------------------------- */

$PASS = 'smartlog';                      // ĐỔI MẬT KHẨU Ở ĐÂY
$FILE = __DIR__ . '/index.html';
$BAK  = __DIR__ . '/index.bak.html';
$TMP  = __DIR__ . '/.index.tmp';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data, $code = 200){
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

/* ---- đọc: trả về nội dung file hiện tại + dấu phiên bản ---- */
if (($_GET['action'] ?? '') === 'read') {
  if (!is_file($FILE)) out(['error' => 'NOFILE'], 404);
  $html = file_get_contents($FILE);
  out(['html' => $html, 'version' => md5($html)]);
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) out(['error' => 'BADREQ'], 400);
$action = $body['action'] ?? '';
$pass   = (string)($body['pass'] ?? '');

/* ---- kiểm mật khẩu ngay lúc gõ, không đợi tới lúc bấm Lưu ---- */
if ($action === 'login') {
  out(['ok' => hash_equals($PASS, $pass)]);
}

/* ---- ghi ---- */
if ($action === 'write') {
  if (!hash_equals($PASS, $pass)) out(['error' => 'AUTH'], 401);

  $html = (string)($body['html'] ?? '');

  // Chốt chặn: không bao giờ ghi một file rỗng hoặc thiếu dấu hiệu chèn nút.
  // Nếu bỏ hai dòng này thì một lỗi bất kỳ ở phía trình duyệt có thể xoá trắng trang.
  if (strlen($html) < 500)                      out(['error' => 'BADHTML'], 400);
  if (strpos($html, '<!--BTN:END-->') === false) out(['error' => 'BADHTML'], 400);

  // Máy khác vừa sửa? Không ghi đè lên công của người ta.
  $cur = is_file($FILE) ? file_get_contents($FILE) : '';
  if ($cur !== '' && ($body['version'] ?? '') !== md5($cur)) out(['error' => 'CONFLICT'], 409);

  if ($cur !== '') @copy($FILE, $BAK);          // bản lùi một bước

  // Ghi ra file tạm rồi rename: rename là thao tác nguyên tử của hệ thống file,
  // nên sale không bao giờ tải trúng lúc file đang ghi dở.
  if (file_put_contents($TMP, $html) === false) out(['error' => 'WRITE'], 500);
  if (!rename($TMP, $FILE)) { @unlink($TMP);    out(['error' => 'RENAME'], 500); }

  out(['ok' => true, 'version' => md5($html)]);
}

out(['error' => 'BADACTION'], 400);
