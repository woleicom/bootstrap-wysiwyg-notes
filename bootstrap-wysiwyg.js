/* http://github.com/mindmup/bootstrap-wysiwyg */
/*global jQuery, $, FileReader*/
/*jslint browser:true*/
(function ($) {
	'use strict';
	/*转码图片*/
	var readFileIntoDataUrl = function (fileInfo) {
		var loader = $.Deferred(),  //jq延迟对象
			fReader = new FileReader();
		fReader.onload = function (e) {
			loader.resolve(e.target.result);
		};
		fReader.onerror = loader.reject; //拒绝
		fReader.onprogress = loader.notify;
		fReader.readAsDataURL(fileInfo); //转码图片
		return loader.promise();  //返回promise
	};
	/*清空内容*/
	$.fn.cleanHtml = function () {
		var html = $(this).html();
		return html && html.replace(/(<br>|\s|<div><br><\/div>|&nbsp;)*$/, '');
	};
	$.fn.wysiwyg = function (userOptions) {
		var editor = this,  //设置ui-jq='设置的插件别名的dom元素'(此句注释可忽略，是针对我的项目结构写的)
			selectedRange,
			options,
			toolbarBtnSelector,
			//更新工具栏
			updateToolbar = function () {
				if (options.activeToolbarClass) {
					$(options.toolbarSelector).find(toolbarBtnSelector).each(function () {
						var command = $(this).data(options.commandRole);
						//判断光标所在位置以确定命令的状态，为真则显示为激活
						if (document.queryCommandState(command)) {
							$(this).addClass(options.activeToolbarClass);
						} else {
							$(this).removeClass(options.activeToolbarClass);
						}
					});
				}
			},
			//插入内容
			execCommand = function (commandWithArgs, valueArg) {
				var commandArr = commandWithArgs.split(' '),
					command = commandArr.shift(),
					args = commandArr.join(' ') + (valueArg || '');
				document.execCommand(command, 0, args);
				updateToolbar();
			},
			//用jquery.hotkeys.js插件监听键盘
			bindHotkeys = function (hotKeys) {
				$.each(hotKeys, function (hotkey, command) {
					editor.keydown(hotkey, function (e) {
						if (editor.attr('contenteditable') && editor.is(':visible')) {
							e.preventDefault();
							e.stopPropagation();
							execCommand(command);
						}
					}).keyup(hotkey, function (e) {
						if (editor.attr('contenteditable') && editor.is(':visible')) {
							e.preventDefault();
							e.stopPropagation();
						}
					});
				});
			},
			//获取当前range对象
			getCurrentRange = function () {
				var sel = window.getSelection();
				if (sel.getRangeAt && sel.rangeCount) {
					return sel.getRangeAt(0); //从当前selection对象中获得一个range对象。
				}
			},
			//保存
			saveSelection = function () {
				selectedRange = getCurrentRange();
			},
			//恢复
			restoreSelection = function () {
				var selection = window.getSelection(); //获取当前既获区，selection是对当前激活选中区（即高亮文本）进行操作
				if (selectedRange) {
					try {
						//移除selection中所有的range对象，执行后anchorNode、focusNode被设置为null，不存在任何被选中的内容。
						selection.removeAllRanges();
					} catch (ex) {
						document.body.createTextRange().select();
						document.selection.empty();
					}
					//将range添加到selection当中，所以一个selection中可以有多个range。
					//注意Chrome不允许同时存在多个range，它的处理方式和Firefox有些不同。
					selection.addRange(selectedRange);
				}
			},
			//插入文件（这里指图片）
			insertFiles = function (files) {
				editor.focus();
				//遍历插入（应为可以多文件插入）
				$.each(files, function (idx, fileInfo) {
					//只可插入图片文件
					if (/^image\//.test(fileInfo.type)) {
						//转码图片
						$.when(readFileIntoDataUrl(fileInfo))
							.done(function (dataUrl) {
							execCommand('insertimage', dataUrl); //插入图片dom及src属性值
						})
							.fail(function (e) {
							options.fileUploadError("file-reader", e);
						});
					} else {
						//非图片文件会调用config的错误函数
						options.fileUploadError("unsupported-file-type", fileInfo.type);
					}
				});
			},
			//TODO 暂不了解用意
			markSelection = function (input, color) {
				restoreSelection();
				//确定命令是否被支持，返回true或false
				if (document.queryCommandSupported('hiliteColor')) {
					document.execCommand('hiliteColor', 0, color || 'transparent');
				}
				saveSelection();
				input.data(options.selectionMarker, color);
			},
			//绑定工具栏相应工具事件
			bindToolbar = function (toolbar, options) {
				//给所有工具栏上的控件绑定点击事件
				toolbar.find(toolbarBtnSelector).click(function () {
					restoreSelection();
					editor.focus();  //获取焦点
					//设置相应配置的工具execCommand
					execCommand($(this).data(options.commandRole));
					//保存
					saveSelection();
				});
				//对[data-toggle=dropdown]进行单独绑定点击事件处理  字体大小
				toolbar.find('[data-toggle=dropdown]').click(restoreSelection);
				//对input控件进行单独处理，webkitspeechchange为语音事件
				toolbar.find('input[type=text][data-' + options.commandRole + ']').on('webkitspeechchange change', function () {
					var newValue = this.value; //获取input 的value
					this.value = '';  //清空value防止冲突
					restoreSelection();
					if (newValue) {
						editor.focus();//获取焦点
						//设置相应配置的工具execCommand
						execCommand($(this).data(options.commandRole), newValue);
					}
					saveSelection();
				}).on('focus', function () { //获取焦点
					var input = $(this);
					if (!input.data(options.selectionMarker)) {
						markSelection(input, options.selectionColor);
						input.focus();
					}
				}).on('blur', function () { //失去焦点
					var input = $(this);
					if (input.data(options.selectionMarker)) {
						markSelection(input, false);
					}
				});
				toolbar.find('input[type=file][data-' + options.commandRole + ']').change(function () {
					restoreSelection();
					if (this.type === 'file' && this.files && this.files.length > 0) {
						insertFiles(this.files);
					}
					saveSelection();
					this.value = '';
				});
			},
			//初始化拖放事件
			initFileDrops = function () {
				editor.on('dragenter dragover', false)
					.on('drop', function (e) {
						var dataTransfer = e.originalEvent.dataTransfer;
						e.stopPropagation();
						e.preventDefault();
						if (dataTransfer && dataTransfer.files && dataTransfer.files.length > 0) {
							insertFiles(dataTransfer.files);
						}
					});
			};
		//合并传入的配置对象userOptions和默认的配置对象config
		options = $.extend({}, $.fn.wysiwyg.defaults, userOptions);
		//设置查找字符串：a[data-edit] button[data-edit] input[type=button][data-edit]
		toolbarBtnSelector = 'a[data-' + options.commandRole + '],button[data-' + options.commandRole + '],input[type=button][data-' + options.commandRole + ']';
		//设置热键 容器有[data-role=editor-toolbar]属性的dom元素
		bindHotkeys(options.hotKeys);
		//是否允许拖放 允许则配置拖放
		if (options.dragAndDropImages) {initFileDrops();}
		//配置工具栏
		bindToolbar($(options.toolbarSelector), options);
		//设置编辑区域为可编辑状态并绑定事件mouseup keyup mouseout
		editor.attr('contenteditable', true)
			.on('mouseup keyup mouseout', function () {
				saveSelection();
				updateToolbar();
			});
		//编辑区域绑定图片点击事件
		//TODO 这是我自己添加的，因为有时要对图片进行一些操作
		editor.on('mousedown','img', function (e) {
			e.preventDefault();
		}).on('click', 'img', function (e) {
			var $img = $(e.currentTarget);
			console.log($img);
			e.preventDefault();
			e.stopPropagation();
		});
		//window绑定touchend事件
		$(window).bind('touchend', function (e) {
			var isInside = (editor.is(e.target) || editor.has(e.target).length > 0),
				currentRange = getCurrentRange(),
				clear = currentRange && (currentRange.startContainer === currentRange.endContainer && currentRange.startOffset === currentRange.endOffset);
			if (!clear || isInside) {
				saveSelection();
				updateToolbar();
			}
		});
		return this;
	};
	//配置参数
	$.fn.wysiwyg.defaults = {
		hotKeys: {      //热键 应用hotkeys.js jquery插件
			'ctrl+b meta+b': 'bold',
			'ctrl+i meta+i': 'italic',
			'ctrl+u meta+u': 'underline',
			'ctrl+z meta+z': 'undo',
			'ctrl+y meta+y meta+shift+z': 'redo',
			'ctrl+l meta+l': 'justifyleft',
			'ctrl+r meta+r': 'justifyright',
			'ctrl+e meta+e': 'justifycenter',
			'ctrl+j meta+j': 'justifyfull',
			'shift+tab': 'outdent',
			'tab': 'indent'
		},
		toolbarSelector: '[data-role=editor-toolbar]',
		commandRole: 'edit',
		activeToolbarClass: 'btn-info',
		selectionMarker: 'edit-focus-marker',
		selectionColor: 'darkgrey',
		dragAndDropImages: true,  //是否支持拖放，默认为支持
		fileUploadError: function (reason, detail) { console.log("File upload error", reason, detail); }
	};
}(window.jQuery));
