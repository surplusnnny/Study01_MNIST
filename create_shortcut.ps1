# 손글씨 숫자 인식기 바탕 화면 바로가기를 만드는 스크립트
#
# - pythonw.exe 로 실행하므로 검은 콘솔 창이 뜨지 않는다.
# - icon.ico 를 바로가기 아이콘으로 지정한다.
# - app.py 와 같은 AppUserModelID 를 바로가기에 넣어, 작업 표시줄에 고정한 아이콘과
#   실행 중인 창이 하나로 묶이게 한다.
#
# 실행 방법: powershell -ExecutionPolicy Bypass -File create_shortcut.ps1

$ErrorActionPreference = 'Stop'

# ----- 경로 설정 -----
$프로젝트폴더 = $PSScriptRoot
$파이썬      = Join-Path $프로젝트폴더 '.venv\Scripts\pythonw.exe'
$앱스크립트   = Join-Path $프로젝트폴더 'app.py'
$아이콘      = Join-Path $프로젝트폴더 'icon.ico'
$앱ID        = 'Study01.MNIST.HandwritingRecognizer'   # app.py 의 앱ID 와 반드시 같아야 한다

# OneDrive 로 옮겨진 바탕 화면도 올바르게 찾도록 시스템에 실제 경로를 묻는다
$바탕화면     = [Environment]::GetFolderPath('Desktop')
$바로가기경로 = Join-Path $바탕화면 '손글씨 숫자 인식기.lnk'

# ----- 필요한 파일이 있는지 확인 -----
foreach ($파일 in @($파이썬, $앱스크립트, $아이콘)) {
    if (-not (Test-Path $파일)) { throw "파일을 찾을 수 없습니다: $파일" }
}

# ----- 1단계: 바로가기(.lnk) 만들기 -----
$셸 = New-Object -ComObject WScript.Shell
$바로가기 = $셸.CreateShortcut($바로가기경로)
$바로가기.TargetPath       = $파이썬
$바로가기.Arguments        = "`"$앱스크립트`""
$바로가기.WorkingDirectory = $프로젝트폴더
$바로가기.IconLocation     = "$아이콘,0"
$바로가기.Description      = '마우스로 그린 숫자를 인식하는 PyTorch MNIST CNN 프로그램'
$바로가기.WindowStyle      = 1   # 보통 크기 창
$바로가기.Save()

# ----- 2단계: 바로가기에 AppUserModelID 넣기 -----
# WScript.Shell 로는 이 속성을 쓸 수 없어서 Windows 셸의 속성 저장소(IPropertyStore)를 직접 사용한다.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class 바로가기속성
{
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore
    {
        void GetCount(out uint 개수);
        void GetAt(uint 순번, out 속성키 키);
        void GetValue(ref 속성키 키, out 속성값 값);
        void SetValue(ref 속성키 키, ref 속성값 값);
        void Commit();
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    struct 속성키
    {
        public Guid 형식ID;
        public uint 속성ID;
    }

    // PROPVARIANT 구조체 중 문자열(VT_LPWSTR)에 필요한 부분만 정의한다 (64비트 크기 24바이트)
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    struct 속성값
    {
        [FieldOffset(0)] public ushort 자료형;
        [FieldOffset(8)] public IntPtr 포인터;
    }

    [DllImport("ole32.dll")]
    static extern int PropVariantClear(ref 속성값 값);

    const ushort VT_LPWSTR = 31;
    const int STGM_READWRITE = 2;

    // System.AppUserModel.ID 속성 키
    static 속성키 앱ID키()
    {
        속성키 키;
        키.형식ID = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        키.속성ID = 5;
        return 키;
    }

    static object 바로가기열기(string 경로)
    {
        // ShellLink COM 객체를 만들어 기존 .lnk 파일을 불러온다
        Type 형식 = Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046"));
        object 링크 = Activator.CreateInstance(형식);
        ((IPersistFile)링크).Load(경로, STGM_READWRITE);
        return 링크;
    }

    public static void 앱ID_쓰기(string 경로, string 앱ID)
    {
        object 링크 = 바로가기열기(경로);
        try
        {
            속성키 키 = 앱ID키();
            속성값 값 = new 속성값();
            값.자료형 = VT_LPWSTR;
            값.포인터 = Marshal.StringToCoTaskMemUni(앱ID);
            try
            {
                IPropertyStore 저장소 = (IPropertyStore)링크;
                저장소.SetValue(ref 키, ref 값);
                저장소.Commit();
            }
            finally
            {
                PropVariantClear(ref 값);
            }
            ((IPersistFile)링크).Save(경로, true);
        }
        finally
        {
            Marshal.ReleaseComObject(링크);
        }
    }

    public static string 앱ID_읽기(string 경로)
    {
        object 링크 = 바로가기열기(경로);
        try
        {
            속성키 키 = 앱ID키();
            속성값 값;
            ((IPropertyStore)링크).GetValue(ref 키, out 값);
            string 결과 = 값.자료형 == VT_LPWSTR ? Marshal.PtrToStringUni(값.포인터) : null;
            PropVariantClear(ref 값);
            return 결과;
        }
        finally
        {
            Marshal.ReleaseComObject(링크);
        }
    }
}
'@

[바로가기속성]::앱ID_쓰기($바로가기경로, $앱ID)

# ----- 결과 확인 -----
$확인한ID = [바로가기속성]::앱ID_읽기($바로가기경로)
if ($확인한ID -ne $앱ID) { throw "AppUserModelID 가 올바르게 저장되지 않았습니다: '$확인한ID'" }

Write-Host "바로가기를 만들었습니다: $바로가기경로"
Write-Host "  대상        : $파이썬 `"$앱스크립트`""
Write-Host "  아이콘      : $아이콘"
Write-Host "  AppUserModelID: $확인한ID"
